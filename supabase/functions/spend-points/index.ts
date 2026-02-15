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

    // Verify user
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

    const { item_id } = await req.json();
    if (!item_id) {
      return new Response(JSON.stringify({ error: "item_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Get store item
    const { data: item, error: itemError } = await admin
      .from("gamification_store_items")
      .select("*")
      .eq("id", item_id)
      .eq("is_active", true)
      .single();

    if (itemError || !item) {
      return new Response(JSON.stringify({ error: "Item not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await admin
      .from("gamification_profiles")
      .select("total_xp, total_coins_spent")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Gamification profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate available coins: floor(total_xp / 10) - total_coins_spent
    const availableCoins = Math.floor(profile.total_xp / 10) - profile.total_coins_spent;

    if (availableCoins < item.price_coins) {
      return new Response(
        JSON.stringify({
          error: "Insufficient coins",
          available: availableCoins,
          required: item.price_coins,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check max_per_user limit
    if (item.max_per_user !== null) {
      const { count } = await admin
        .from("gamification_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("item_id", item_id);

      if ((count || 0) >= item.max_per_user) {
        return new Response(
          JSON.stringify({ error: "Maximum redemptions reached for this item" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create redemption record
    const { error: redemptionError } = await admin
      .from("gamification_redemptions")
      .insert({
        user_id: user.id,
        item_id: item_id,
        coins_spent: item.price_coins,
      });

    if (redemptionError) {
      return new Response(JSON.stringify({ error: "Failed to process redemption" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update total_coins_spent
    await admin
      .from("gamification_profiles")
      .update({ total_coins_spent: profile.total_coins_spent + item.price_coins, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    // Special handling for streak_freeze
    if (item.slug === "streak_freeze") {
      await admin
        .from("gamification_profiles")
        .update({
          streak_freezes_available: Math.min(
            (await admin.from("gamification_profiles").select("streak_freezes_available").eq("user_id", user.id).single()).data?.streak_freezes_available + 1 || 1,
            5
          ),
        })
        .eq("user_id", user.id);
    }

    // Create user reward record for applicable items
    if (["double_xp_1h", "hint_token", "early_access"].includes(item.slug)) {
      const expiresAt = item.slug === "double_xp_1h"
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : item.slug === "early_access"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await admin.from("gamification_user_rewards").insert({
        user_id: user.id,
        reward_type: item.slug,
        reward_data: { item_id: item.id, item_title: item.title },
        expires_at: expiresAt,
        is_active: true,
      });
    }

    const coinsRemaining = availableCoins - item.price_coins;

    return new Response(
      JSON.stringify({
        success: true,
        item: { id: item.id, name: item.title, slug: item.slug },
        coins_spent: item.price_coins,
        coins_remaining: coinsRemaining,
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
