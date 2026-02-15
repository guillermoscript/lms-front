import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user from the JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    const targetUserId = user_id || user.id;

    // Only allow checking own achievements (or service_role)
    if (targetUserId !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for writes
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Get user's gamification profile
    const { data: profile } = await admin
      .from("gamification_profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ newly_earned: [], count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get already earned achievement IDs
    const { data: earnedAchievements } = await admin
      .from("gamification_user_achievements")
      .select("achievement_id")
      .eq("user_id", targetUserId);

    const earnedIds = new Set((earnedAchievements || []).map((a) => a.achievement_id));

    // Get all achievements
    const { data: allAchievements } = await admin
      .from("gamification_achievements")
      .select("*");

    if (!allAchievements) {
      return new Response(JSON.stringify({ newly_earned: [], count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather stats in parallel
    const [
      lessonsResult,
      examsResult,
      perfectExamsResult,
      exercisesResult,
      exercisesHighResult,
      commentsResult,
      likesResult,
      reviewsResult,
      coursesCompletedResult,
      todayLessonsResult,
      avgExamResult,
      challengesWonResult,
    ] = await Promise.all([
      admin.from("lesson_completions").select("id", { count: "exact", head: true }).eq("user_id", targetUserId),
      admin.from("exam_submissions").select("submission_id", { count: "exact", head: true }).eq("student_id", targetUserId),
      admin.from("exam_submissions").select("submission_id", { count: "exact", head: true }).eq("student_id", targetUserId).gte("score", 100),
      admin.from("exercise_completions").select("id", { count: "exact", head: true }).eq("user_id", targetUserId),
      admin.from("exercise_completions").select("id", { count: "exact", head: true }).eq("user_id", targetUserId).gte("score", 80),
      admin.from("lesson_comments").select("id", { count: "exact", head: true }).eq("user_id", targetUserId),
      admin.rpc("get_likes_received_count", { _user_id: targetUserId }).then(r => r, () => ({ data: 0 })),
      admin.from("reviews").select("review_id", { count: "exact", head: true }).eq("user_id", targetUserId),
      // Count courses where all lessons are completed
      admin.rpc("get_completed_courses_count", { _user_id: targetUserId }).then(r => r, () => ({ data: 0 })),
      // Today's lessons
      admin.from("lesson_completions").select("id", { count: "exact", head: true })
        .eq("user_id", targetUserId)
        .gte("completed_at", new Date().toISOString().split("T")[0]),
      // Average exam score
      admin.from("exam_submissions").select("score").eq("student_id", targetUserId).not("score", "is", null),
      // Challenges won
      admin.from("gamification_challenge_participants").select("id", { count: "exact", head: true })
        .eq("user_id", targetUserId)
        .not("completed_at", "is", null),
    ]);

    // Calculate average exam score
    const examScores = avgExamResult.data || [];
    const avgScore = examScores.length > 0
      ? examScores.reduce((sum: number, e: { score: number }) => sum + Number(e.score), 0) / examScores.length
      : 0;

    // Calculate likes received (count reactions of type 'like' on user's comments)
    const { count: likesCount } = await admin
      .from("comment_reactions")
      .select("id", { count: "exact", head: true })
      .eq("reaction_type", "like")
      .in(
        "comment_id",
        (await admin.from("lesson_comments").select("id").eq("user_id", targetUserId)).data?.map((c) => c.id) || []
      );

    const stats: Record<string, number> = {
      lessons_completed: lessonsResult.count || 0,
      exams_submitted: examsResult.count || 0,
      perfect_exams: perfectExamsResult.count || 0,
      exercises_completed: exercisesResult.count || 0,
      exercises_high_score: exercisesHighResult.count || 0,
      comments_posted: commentsResult.count || 0,
      likes_received: likesCount || 0,
      reviews_written: reviewsResult.count || 0,
      courses_completed: typeof coursesCompletedResult.data === "number" ? coursesCompletedResult.data : 0,
      lessons_in_day: todayLessonsResult.count || 0,
      avg_exam_score: Math.round(avgScore),
      streak_days: profile.longest_streak || 0,
      level_reached: profile.level || 1,
      total_xp: profile.total_xp || 0,
      challenges_won: challengesWonResult.count || 0,
    };

    // Check each unearned achievement
    const newlyEarned: string[] = [];

    for (const achievement of allAchievements) {
      if (earnedIds.has(achievement.id)) continue;

      const currentValue = stats[achievement.condition_type] || 0;
      if (currentValue >= achievement.condition_value) {
        // Award achievement
        const { error: insertError } = await admin
          .from("gamification_user_achievements")
          .insert({ user_id: targetUserId, achievement_id: achievement.id });

        if (!insertError) {
          newlyEarned.push(achievement.slug);

          // Award XP bonus for achievement
          if (achievement.xp_reward > 0) {
            await admin.rpc("award_xp", {
              _user_id: targetUserId,
              _action_type: "achievement_bonus",
              _xp_amount: achievement.xp_reward,
              _reference_id: achievement.id.toString(),
              _reference_type: "achievement",
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ newly_earned: newlyEarned, count: newlyEarned.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
