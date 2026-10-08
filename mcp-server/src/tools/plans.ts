import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { errorResult, structured } from "../format.js";

/**
 * The school's subscription plans (`plans`: what students subscribe to), read-only and
 * admin only. Landing pages bind them by id (PricingTable `planIds`), so external agents
 * need the ids; prices are shown live by the block, never copied into page text.
 * Not the platform plan the school itself pays for — that is lms_get_plan_usage.
 */

export interface SchoolPlan {
  id: number;
  name: string;
  description: string | null;
  price: number;
  currency: string | null;
  duration_in_days: number | null;
  features: string | null;
}

export const listPlansOutput = z.object({
  plans: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      description: z.string().nullable(),
      price: z.number(),
      currency: z.string().nullable(),
      duration_in_days: z.number().nullable(),
      features: z.string().nullable(),
    })
  ),
  count: z.number(),
});

/** Tenant-filtered, not soft-deleted, cheapest first (the PricingTable order). */
export async function listPlansForSession(session: LmsSession): Promise<SchoolPlan[]> {
  const { data, error } = await session
    .getClient()
    .from("plans")
    .select("plan_id, plan_name, description, price, currency, duration_in_days, features")
    .eq("tenant_id", session.getTenantId())
    .is("deleted_at", null)
    .order("price", { ascending: true });
  if (error) throw new Error(`Listing plans: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: Number(p.plan_id),
    name: (p.plan_name as string | null) ?? "",
    description: (p.description as string | null) ?? null,
    price: Number(p.price ?? 0),
    currency: (p.currency as string | null) ?? null,
    duration_in_days: p.duration_in_days == null ? null : Number(p.duration_in_days),
    features: (p.features as string | null) ?? null,
  }));
}

export function registerPlanTools(server: LmsServer) {
  server.tool(
    {
      name: "lms_list_plans",
      description:
        "List the school's subscription plans (id, name, price, currency, duration). Use the ids for a landing page's PricingTable planIds. Admin only.",
      inputSchema: z.object({}),
      outputSchema: listPlansOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (_input, ctx) => {
      try {
        const session = LmsSession.fromContext(ctx);
        if (!session.isAdmin()) return errorResult("Plans are managed by school admins only.");
        const plans = await listPlansForSession(session);
        const lines = plans.map(
          (p) =>
            `- ${p.name} (ID: ${p.id}) ${p.price} ${(p.currency ?? "").toUpperCase()}${p.duration_in_days ? ` / ${p.duration_in_days} days` : ""}`
        );
        return structured(
          { plans, count: plans.length },
          plans.length ? `${plans.length} plan(s):\n${lines.join("\n")}` : "This school has no subscription plans."
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
