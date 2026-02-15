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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch profile, levels, achievements, and recent XP in parallel
    const [
      profileResult,
      levelsResult,
      achievementsResult,
      recentXpResult,
    ] = await Promise.all([
      admin.from("gamification_profiles").select("*").eq("user_id", user.id).single(),
      admin.from("gamification_levels").select("*").order("level", { ascending: true }),
      admin
        .from("gamification_user_achievements")
        .select("*, achievement:gamification_achievements(*)")
        .eq("user_id", user.id)
        .order("earned_at", { ascending: false })
        .limit(5),
      admin
        .from("gamification_xp_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const profile = profileResult.data || {
      total_xp: 0,
      level: 1,
      current_streak: 0,
      longest_streak: 0,
      streak_freezes_available: 0,
      total_coins_spent: 0,
      last_activity_date: null,
    };

    const levels = levelsResult.data || [];

    // Find current and next level
    const currentLevel = levels.find((l) => l.level === profile.level) || levels[0];
    const nextLevel = levels.find((l) => l.level === profile.level + 1);

    // Calculate XP progress to next level
    const xpForCurrentLevel = currentLevel?.min_xp || 0;
    const xpForNextLevel = nextLevel?.min_xp || null;
    const xpProgress = xpForNextLevel
      ? {
          current: profile.total_xp - xpForCurrentLevel,
          required: xpForNextLevel - xpForCurrentLevel,
          percentage: Math.min(
            100,
            Math.round(
              ((profile.total_xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100
            )
          ),
        }
      : { current: 0, required: 0, percentage: 100 }; // Max level

    // Calculate available coins
    const availableCoins = Math.floor(profile.total_xp / 10) - profile.total_coins_spent;

    // Trigger lazy achievement check
    let newlyEarnedAchievements: string[] = [];
    try {
      const checkResponse = await fetch(`${supabaseUrl}/functions/v1/check-achievements`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        newlyEarnedAchievements = checkResult.newly_earned || [];
      }
    } catch {
      // Non-critical — continue without achievement check
    }

    // Get total achievement count
    const { count: totalAchievements } = await admin
      .from("gamification_achievements")
      .select("id", { count: "exact", head: true });

    const { count: earnedCount } = await admin
      .from("gamification_user_achievements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({
        total_xp: profile.total_xp,
        level: profile.level,
        level_title: currentLevel?.title || "Newcomer",
        level_icon: currentLevel?.icon || null,
        xp_progress: xpProgress,
        streak: {
          current: profile.current_streak,
          longest: profile.longest_streak,
          freezes_available: profile.streak_freezes_available,
          last_activity: profile.last_activity_date,
        },
        coins: availableCoins,
        achievements: {
          earned: earnedCount || 0,
          total: totalAchievements || 0,
          recent: (achievementsResult.data || []).map((ua) => ({
            slug: ua.achievement?.slug,
            title: ua.achievement?.title,
            description: ua.achievement?.description,
            tier: ua.achievement?.tier,
            category: ua.achievement?.category,
            icon: ua.achievement?.icon,
            earned_at: ua.earned_at,
          })),
          newly_earned: newlyEarnedAchievements,
        },
        recent_xp: (recentXpResult.data || []).map((tx) => ({
          action_type: tx.action_type,
          xp_amount: tx.xp_amount,
          reference_type: tx.reference_type,
          created_at: tx.created_at,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
