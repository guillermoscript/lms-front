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

    const tenantId = getTenantIdFromJwt(authHeader) || "00000000-0000-0000-0000-000000000001";
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Check if store feature is enabled for this tenant's plan
    const { data: features } = await admin.rpc("get_gamification_features", { _tenant_id: tenantId });
    if (!features?.store) {
      return new Response(JSON.stringify({ error: "Store is not available on your plan", feature_locked: true }), {
        status: 403,
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

    // Get store item (global or tenant-specific)
    const { data: item, error: itemError } = await admin
      .from("gamification_store_items")
      .select("*")
      .eq("id", item_id)
      .eq("is_available", true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .single();

    if (itemError || !item) {
      return new Response(JSON.stringify({ error: "Item not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user profile (tenant-scoped)
    const { data: profile, error: profileError } = await admin
      .from("gamification_profiles")
      .select("total_xp, total_coins_spent")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Gamification profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate available coins
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

    // Check max_per_user limit (tenant-scoped)
    if (item.max_per_user !== null) {
      const { count } = await admin
        .from("gamification_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("item_id", item_id);

      if ((count || 0) >= item.max_per_user) {
        return new Response(
          JSON.stringify({ error: "Maximum redemptions reached for this item" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create redemption record (tenant-scoped)
    const { error: redemptionError } = await admin
      .from("gamification_redemptions")
      .insert({
        user_id: user.id,
        item_id: item_id,
        coins_spent: item.price_coins,
        tenant_id: tenantId,
      });

    if (redemptionError) {
      return new Response(JSON.stringify({ error: "Failed to process redemption" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update total_coins_spent (tenant-scoped)
    await admin
      .from("gamification_profiles")
      .update({ total_coins_spent: profile.total_coins_spent + item.price_coins, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId);

    // Special handling for streak_freeze
    if (item.slug === "streak_freeze") {
      const { data: currentProfile } = await admin
        .from("gamification_profiles")
        .select("streak_freezes_available")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .single();

      await admin
        .from("gamification_profiles")
        .update({
          streak_freezes_available: Math.min((currentProfile?.streak_freezes_available || 0) + 1, 5),
        })
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId);
    }

    // Create user reward record for applicable items (tenant-scoped)
    if (["double_xp_1h", "hint_token", "early_access"].includes(item.slug)) {
      const expiresAt = item.slug === "double_xp_1h"
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : item.slug === "early_access"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await admin.from("gamification_user_rewards").insert({
        user_id: user.id,
        reward_type: item.slug,
        reward_data: { item_id: item.id, item_name: item.name },
        expires_at: expiresAt,
        is_active: true,
        tenant_id: tenantId,
      });
    }

    const coinsRemaining = availableCoins - item.price_coins;

    return new Response(
      JSON.stringify({
        success: true,
        item: { id: item.id, name: item.name, slug: item.slug },
        coins_spent: item.price_coins,
        coins_remaining: coinsRemaining,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
