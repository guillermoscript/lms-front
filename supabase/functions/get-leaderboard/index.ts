import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function getTenantIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tenant_id || payload.app_metadata?.tenant_id || null;
  } catch {
    return null;
  }
}

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

    const tenantId = getTenantIdFromJwt(authHeader) || "00000000-0000-0000-0000-000000000001";

    const url = new URL(req.url);
    const timeframe = url.searchParams.get("timeframe") || "weekly";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Check if leaderboard feature is enabled for this tenant
    const { data: features } = await admin.rpc("get_gamification_features", { _tenant_id: tenantId });
    if (!features?.leaderboard) {
      return new Response(JSON.stringify({ error: "Leaderboard is not available on your plan", feature_locked: true }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let leaderboardData: Array<{
      rank: number;
      user_id: string;
      full_name: string | null;
      avatar_url: string | null;
      username: string | null;
      xp: number;
      level: number;
      current_streak: number;
    }> = [];

    if (timeframe === "all_time") {
      // Use profiles directly, scoped to tenant
      const { data: profiles } = await admin
        .from("gamification_profiles")
        .select("user_id, total_xp, level, current_streak")
        .eq("tenant_id", tenantId)
        .order("total_xp", { ascending: false })
        .range(offset, offset + limit - 1);

      if (profiles && profiles.length > 0) {
        const userIds = profiles.map((p: any) => p.user_id);
        const { data: profilesData } = await admin
          .from("profiles")
          .select("id, full_name, avatar_url, username")
          .in("id", userIds);

        const profileMap = new Map(
          (profilesData || []).map((p: any) => [p.id, p])
        );

        leaderboardData = profiles.map((p: any, i: number) => {
          const userProfile = profileMap.get(p.user_id);
          return {
            rank: offset + i + 1,
            user_id: p.user_id,
            full_name: userProfile?.full_name || null,
            avatar_url: userProfile?.avatar_url || null,
            username: userProfile?.username || null,
            xp: p.total_xp,
            level: p.level,
            current_streak: p.current_streak,
          };
        });
      }
    } else {
      // Weekly/monthly: aggregate from xp_transactions within tenant
      const periodStart = timeframe === "weekly"
        ? getWeekStart()
        : getMonthStart();

      const { data: transactions } = await admin
        .from("gamification_xp_transactions")
        .select("user_id, xp_amount")
        .eq("tenant_id", tenantId)
        .gte("created_at", periodStart.toISOString());

      // Aggregate XP per user
      const xpMap = new Map<string, number>();
      for (const tx of transactions || []) {
        xpMap.set(tx.user_id, (xpMap.get(tx.user_id) || 0) + tx.xp_amount);
      }

      // Sort and paginate
      const sorted = Array.from(xpMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(offset, offset + limit);

      if (sorted.length > 0) {
        const userIds = sorted.map(([uid]) => uid);
        const [{ data: profilesData }, { data: gamProfiles }] = await Promise.all([
          admin.from("profiles").select("id, full_name, avatar_url, username").in("id", userIds),
          admin.from("gamification_profiles").select("user_id, level, current_streak").eq("tenant_id", tenantId).in("user_id", userIds),
        ]);

        const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));
        const gamMap = new Map((gamProfiles || []).map((p: any) => [p.user_id, p]));

        leaderboardData = sorted.map(([uid, xp], i) => {
          const userProfile = profileMap.get(uid);
          const gamProfile = gamMap.get(uid);
          return {
            rank: offset + i + 1,
            user_id: uid,
            full_name: userProfile?.full_name || null,
            avatar_url: userProfile?.avatar_url || null,
            username: userProfile?.username || null,
            xp,
            level: gamProfile?.level || 1,
            current_streak: gamProfile?.current_streak || 0,
          };
        });
      }
    }

    return new Response(JSON.stringify(leaderboardData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
