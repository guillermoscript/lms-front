import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Store redemption.
 *
 * Auth and the plan feature gate happen here; the mutation itself is one call
 * to the redeem_store_item() RPC, which runs under a SELECT ... FOR UPDATE on
 * the caller's gamification_profiles row (migration 20260726140400, issue #549
 * §6).
 *
 * This function previously did the work inline as three separate
 * read-modify-write cycles — total_coins_spent, streak_freezes_available, and a
 * count-then-insert for the max_per_user cap — with no transaction. Because the
 * coin balance is derived (floor(total_xp / 10) - total_coins_spent), a lost
 * update meant the student kept the item AND the coins, and two parallel
 * purchases cost one item's price. Do not reintroduce mutations here: the RPC
 * is the only writer, so the lock actually covers everything it needs to.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const tenantId = getTenantIdFromJwt(authHeader) || "00000000-0000-0000-0000-000000000001";
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Check if store feature is enabled for this tenant's plan
    const { data: features } = await admin.rpc("get_gamification_features", { _tenant_id: tenantId });
    if (!features?.store) {
      return json({ error: "Store is not available on your plan", feature_locked: true }, 403);
    }

    const { item_id } = await req.json();
    if (!item_id) {
      return json({ error: "item_id is required" }, 400);
    }

    // The whole redemption, atomically. `user.id` comes from the verified JWT
    // above — the RPC is service-role only and trusts its caller for that.
    const { data: result, error: rpcError } = await admin.rpc("redeem_store_item", {
      _user_id: user.id,
      _tenant_id: tenantId,
      _item_id: item_id,
    });

    if (rpcError) {
      return json({ error: "Failed to process redemption", detail: rpcError.message }, 500);
    }

    if (!result?.ok) {
      const notFound = result?.code === "item_not_found" || result?.code === "no_profile";
      return json(
        {
          error: result?.error ?? "Redemption failed",
          code: result?.code ?? "unknown",
          // Preserved from the previous shape so existing clients keep working.
          ...(result?.code === "insufficient_coins"
            ? { available: result.available, required: result.required }
            : {}),
        },
        notFound ? 404 : 400
      );
    }

    return json({
      success: true,
      item: result.item,
      coins_spent: result.coins_spent,
      coins_remaining: result.coins_remaining,
      streak_freezes_available: result.streak_freezes_available,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getTenantIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tenant_id || payload.app_metadata?.tenant_id || null;
  } catch {
    return null;
  }
}
