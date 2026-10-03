import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { errorResult } from "../format.js";
import { getTenantPlanUsage } from "../plan-limits.js";
import {
  DEFAULT_SCHOOL_PERCENTAGE,
  LIVE_SUBSCRIPTION_STATUSES,
  OPEN_PAYMENT_REQUEST_STATUSES,
  PAYMENT_REQUEST_STATUSES,
  SUBSCRIPTION_STATUSES,
  TRANSACTION_STATUSES,
  computeSchoolRevenue,
  netOfRefunds,
  paymentRequestTransitionError,
  roundMoney,
} from "../commerce-math.js";

/**
 * Commerce tools (#897) — ADMIN ONLY (see `ADMIN_ONLY_TOOLS` in tool-policy.ts).
 *
 * Read-first: products, plans, the manual-payment queue, transactions,
 * subscriptions, the school's revenue split + what the platform owes it, and
 * the school's own platform billing status. Every read runs on the caller's
 * RLS-scoped client and filters `tenant_id` explicitly — several of these
 * tables carry permissive no-tenant policies (`products` "Anyone can view
 * active products", `plans` "Anyone can view plans"), so the filter is what
 * keeps another school's catalogue out, not decoration.
 *
 * ── WRITES ────────────────────────────────────────────────────────────────
 * Two, both on `payment_requests` through the same RLS UPDATE policy the
 * dashboard's own server actions use ("Admins can update tenant payment
 * requests"), never a service-role client:
 *
 *   - `lms_confirm_payment_received` — pending|contacted → payment_received
 *     (`confirmPaymentReceived`).
 *   - `lms_reject_payment_request` — pending|contacted|payment_received →
 *     cancelled (`cancelPaymentRequest`).
 *
 * The final step — COMPLETING a confirmed request, which inserts the
 * `transactions` row whose `after_transaction_insert` trigger grants the
 * entitlements — is deliberately NOT here. `transactions` is server-write-only
 * (#538: `authenticated` has no INSERT grant) and the app does it with
 * `createAdminClient()` in `completeAndEnroll`; there is no SECURITY DEFINER
 * RPC for it, and the MCP never holds the service role. Calling `enroll_user`
 * directly would grant access with no sale on record, so the tool says where
 * to finish instead (Dashboard → Payment requests → Enroll).
 *
 * Money is never computed by the host: net amounts are `amount -
 * refunded_amount` (#547) and the fee/owed split follows the provider's
 * capabilities and each row's split snapshot — see `commerce-math.ts`.
 */

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Session for an admin-only tool. The call guard already refuses other roles; this is depth. */
function adminSession(ctx: unknown): LmsSession {
  const session = LmsSession.fromContext(ctx);
  if (!session.isAdmin()) {
    throw new Error("Commerce tools are available to school admins only.");
  }
  return session;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Raw MCP envelope carrying a schema-backed payload plus its human summary. */
function structured<T extends Record<string, unknown>>(data: T, summary: string) {
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: data,
  };
}

const limitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe("Maximum results to return (1-100, default 20)");
const offsetField = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe("Number of results to skip for pagination");

/**
 * Loose UUID: zod 4's `.uuid()` enforces the RFC variant nibble and rejects
 * the platform's seeded ids (`00000000-…-0001`), so `guid()` it is.
 */
const userIdField = z.guid().describe("Filter to one student's user ID (UUID)");

const isoDateField = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Must be an ISO 8601 date or date-time")
  .describe("ISO 8601 date or date-time, e.g. 2026-09-01");

const paginationOut = {
  total: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
};

function page(total: number, offset: number, shown: number) {
  const more = total > offset + shown;
  return { total, offset, has_more: more, next_offset: more ? offset + shown : null };
}

/** PostgREST embeds come back as an object or a one-element array depending on the FK shape. */
function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** `profiles` is global (no tenant_id); names keyed by user id. */
async function fetchProfileNames(
  supabase: SupabaseClient,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  for (const p of (data as { id: string; full_name: string | null }[] | null) ?? []) {
    const name = p.full_name?.trim();
    if (name) names.set(p.id, name);
  }
  return names;
}

type PageResult = PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}>;

/**
 * Page through a whole relation and verify the row count (#533/#548): every
 * figure built from these rows is a SUM, so a read silently truncated at the
 * PostgREST row cap would report a confidently wrong balance. The query must
 * request `{ count: "exact" }` and order by a unique key.
 */
export async function fetchAllPages<T>(
  label: string,
  fetchPage: (from: number, to: number) => PageResult,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`Loading ${label}: ${error.message}`);
    if (expected === null) expected = count;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  if (expected !== null && rows.length !== expected) {
    throw new Error(
      `Loading ${label}: read ${rows.length} rows but the server reports ${expected}; refusing to report a partial total.`
    );
  }
  return rows;
}

/**
 * Best-effort in-app notice to the student, mirroring `notifyPaymentRequestStatus`
 * in app/actions/payment-requests.ts — but on the caller's RLS client: admins may
 * INSERT tenant notifications ("Admins can create tenant notifications") and
 * manage their `user_notifications`. A failure never fails the status change.
 */
async function notifyStudent(
  session: LmsSession,
  studentUserId: string,
  itemName: string,
  status: string
): Promise<boolean> {
  try {
    const supabase = session.getClient();
    const { data: notification, error } = await supabase
      .from("notifications")
      .insert({
        title: "Payment request update",
        content: `Your payment request for ${itemName} is now ${status}`,
        notification_type: "info",
        priority: "normal",
        target_type: "user",
        target_user_ids: [studentUserId],
        status: "sent",
        sent_at: new Date().toISOString(),
        created_by: session.getUserId(),
        tenant_id: session.getTenantId(),
      })
      .select("id")
      .single();
    if (error || !notification) return false;
    const { error: linkError } = await supabase
      .from("user_notifications")
      .insert({ notification_id: notification.id, user_id: studentUserId });
    return !linkError;
  } catch {
    return false;
  }
}

// ── Input schemas (exported for tests) ──────────────────────────────────────

export const listProductsInput = z.object({
  status: z
    .enum(["active", "inactive", "all"])
    .default("all")
    .describe("'active' (on sale), 'inactive' (archived), or 'all' (default)"),
  limit: limitField,
  offset: offsetField,
});

export const listPlansInput = z.object({
  include_deleted: z
    .boolean()
    .default(false)
    .describe("Include soft-deleted plans (deleted_at set). Default false."),
  limit: limitField,
  offset: offsetField,
});

export const listPaymentRequestsInput = z.object({
  status: z
    .enum([...PAYMENT_REQUEST_STATUSES, "open", "all"])
    .default("open")
    .describe(
      "'open' (default: pending, contacted or payment_received — the admin's queue), 'all', or one status: pending | contacted | payment_received | completed | cancelled"
    ),
  user_id: userIdField.optional(),
  limit: limitField,
  offset: offsetField,
});

export const confirmPaymentInput = z.object({
  request_id: z.number().int().positive().describe("The payment request ID"),
  admin_notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .describe("Internal note, e.g. the bank reference you matched (optional)"),
});

export const rejectPaymentInput = z.object({
  request_id: z.number().int().positive().describe("The payment request ID"),
  reason: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .describe("Why it was rejected; stored as the request's admin note (optional)"),
});

export const listTransactionsInput = z.object({
  status: z
    .enum(TRANSACTION_STATUSES)
    .optional()
    .describe("Filter by status (successful = settled sale; refunded = FULL refund — a partial refund stays successful)"),
  payment_provider: z
    .enum([
      "stripe",
      "paypal",
      "lemonsqueezy",
      "solana",
      "solana_subs",
      "binance",
      "binance_personal",
      "manual",
    ])
    .optional()
    .describe("Filter by payment provider"),
  user_id: userIdField.optional(),
  product_id: z.number().int().positive().optional().describe("Filter by product ID"),
  plan_id: z.number().int().positive().optional().describe("Filter by plan ID"),
  from: isoDateField.optional().describe("Only transactions on/after this date (transaction_date)"),
  to: isoDateField.optional().describe("Only transactions before this date (transaction_date)"),
  limit: limitField,
  offset: offsetField,
});

export const listSubscriptionsInput = z.object({
  status: z
    .enum([...SUBSCRIPTION_STATUSES, "live", "all"])
    .default("all")
    .describe(
      "'all' (default), 'live' (active, renewed or past_due — all still grant access), or one subscription_status"
    ),
  user_id: userIdField.optional(),
  plan_id: z.number().int().positive().optional().describe("Filter by plan ID"),
  limit: limitField,
  offset: offsetField,
});

export const emptyInput = z.object({});

// ── Output schemas ──────────────────────────────────────────────────────────

const productsOutput = z.object({
  ...paginationOut,
  products: z.array(
    z.object({
      product_id: z.number(),
      name: z.string(),
      price: z.number().nullable(),
      currency: z.string().nullable(),
      status: z.string().nullable(),
      payment_provider: z.string().nullable(),
      course_ids: z.array(z.number()),
      created_at: z.string().nullable(),
    })
  ),
});

const plansOutput = z.object({
  ...paginationOut,
  plans: z.array(
    z.object({
      plan_id: z.number(),
      plan_name: z.string(),
      price: z.number().nullable(),
      currency: z.string().nullable(),
      duration_in_days: z.number().nullable(),
      payment_provider: z.string().nullable(),
      deleted_at: z.string().nullable(),
      course_ids: z.array(z.number()),
    })
  ),
});

const paymentRequestRow = z.object({
  request_id: z.number(),
  status: z.string(),
  user_id: z.string(),
  contact_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  item: z.string().nullable(),
  product_id: z.number().nullable(),
  plan_id: z.number().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  payment_method: z.string().nullable(),
  payment_reference: z.string().nullable(),
  reported_amount: z.number().nullable(),
  reported_currency: z.string().nullable(),
  payment_reported_at: z.string().nullable(),
  payment_confirmed_at: z.string().nullable(),
  created_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  admin_notes: z.string().nullable(),
});

const paymentRequestsOutput = z.object({
  ...paginationOut,
  requests: z.array(paymentRequestRow),
});

const transitionOutput = z.object({
  request_id: z.number(),
  previous_status: z.string(),
  status: z.string(),
  changed: z.boolean(),
  student_notified: z.boolean(),
  next_step: z.string().nullable(),
});

const transactionsOutput = z.object({
  ...paginationOut,
  transactions: z.array(
    z.object({
      transaction_id: z.number(),
      transaction_date: z.string(),
      user_id: z.string(),
      student_name: z.string().nullable(),
      item: z.string().nullable(),
      product_id: z.number().nullable(),
      plan_id: z.number().nullable(),
      status: z.string(),
      payment_provider: z.string().nullable(),
      currency: z.string().nullable(),
      amount: z.number(),
      refunded_amount: z.number(),
      net_amount: z.number(),
    })
  ),
  page_totals: z.array(
    z.object({ currency: z.string(), successful_net: z.number(), count: z.number() })
  ),
});

const subscriptionsOutput = z.object({
  ...paginationOut,
  subscriptions: z.array(
    z.object({
      subscription_id: z.number(),
      user_id: z.string(),
      student_name: z.string().nullable(),
      plan_id: z.number(),
      plan_name: z.string().nullable(),
      subscription_status: z.string(),
      live: z.boolean(),
      payment_provider: z.string().nullable(),
      current_period_start: z.string().nullable(),
      current_period_end: z.string().nullable(),
      cancel_at_period_end: z.boolean(),
      cancel_at: z.string().nullable(),
      canceled_at: z.string().nullable(),
      created: z.string().nullable(),
    })
  ),
});

const payoutsOutput = z.object({
  school_percentage: z.number(),
  currencies: z.array(
    z.object({
      currency: z.string(),
      gross_revenue: z.number(),
      platform_fees: z.number(),
      school_revenue: z.number(),
      platform_collected: z.number(),
      owed_gross: z.number(),
      already_paid: z.number(),
      net_owed: z.number(),
      overpaid: z.number(),
      transactions: z.number(),
    })
  ),
  recent_payouts: z.array(
    z.object({
      payout_id: z.number(),
      amount: z.number(),
      currency: z.string().nullable(),
      status: z.string(),
      payout_method: z.string().nullable(),
      period_start: z.string().nullable(),
      period_end: z.string().nullable(),
      paid_at: z.string().nullable(),
      created_at: z.string().nullable(),
    })
  ),
});

const billingOutput = z.object({
  school_name: z.string().nullable(),
  plan: z.string(),
  plan_name: z.string().nullable(),
  billing_status: z.string(),
  billing_period_end: z.string().nullable(),
  access_cutoff_at: z.string().nullable(),
  transaction_fee_percent: z.number().nullable(),
  subscription: z
    .object({
      status: z.string(),
      payment_provider: z.string(),
      interval: z.string(),
      cancel_at_period_end: z.boolean(),
      current_period_start: z.string().nullable(),
      current_period_end: z.string().nullable(),
      grace_period_end: z.string().nullable(),
    })
    .nullable(),
  usage: z
    .object({
      courses: z.number(),
      max_courses: z.number(),
      students: z.number(),
      max_students: z.number(),
    })
    .nullable(),
  recent_platform_payment_requests: z.array(
    z.object({
      request_id: z.string(),
      status: z.string(),
      plan: z.string().nullable(),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      interval: z.string().nullable(),
      payment_provider: z.string().nullable(),
      created_at: z.string().nullable(),
      expires_at: z.string().nullable(),
    })
  ),
});

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function money(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  return `${amount.toFixed(2)} ${(currency ?? "usd").toUpperCase()}`;
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerCommerceTools(server: LmsServer) {
  // ── lms_list_products ─────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_products",
      description:
        "Admin: list the school's products (one-time purchases) with price, currency, status, payment provider and the course IDs each one unlocks.",
      inputSchema: listProductsInput,
      outputSchema: productsOutput,
      annotations: READ_ONLY,
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        let query = supabase
          .from("products")
          .select("product_id, name, price, currency, status, payment_provider, created_at", {
            count: "exact",
          })
          .eq("tenant_id", tenantId)
          .order("product_id", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (input.status !== "all") query = query.eq("status", input.status);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing products: ${error.message}`);
        const rows = data ?? [];

        // A product can map to several courses — never `.single()` here.
        const courseIds = new Map<number, number[]>();
        if (rows.length > 0) {
          const { data: links, error: linkError } = await supabase
            .from("product_courses")
            .select("product_id, course_id")
            .eq("tenant_id", tenantId)
            .in(
              "product_id",
              rows.map((r) => r.product_id)
            );
          if (linkError) return errorResult(`Loading product courses: ${linkError.message}`);
          for (const l of links ?? []) {
            courseIds.set(l.product_id, [...(courseIds.get(l.product_id) ?? []), l.course_id]);
          }
        }

        const products = rows.map((p) => ({
          product_id: p.product_id as number,
          name: p.name as string,
          price: num(p.price),
          currency: (p.currency as string | null) ?? null,
          status: (p.status as string | null) ?? null,
          payment_provider: (p.payment_provider as string | null) ?? null,
          course_ids: courseIds.get(p.product_id) ?? [],
          created_at: (p.created_at as string | null) ?? null,
        }));
        const out = { ...page(count ?? products.length, input.offset, products.length), products };

        const lines = [`# Products (${products.length} of ${out.total})`, ""];
        for (const p of products) {
          lines.push(
            `- **${p.name}** (#${p.product_id}) — ${money(p.price, p.currency)} [${p.status ?? "?"}] via ${p.payment_provider ?? "?"}; courses: ${p.course_ids.join(", ") || "none"}`
          );
        }
        if (products.length === 0) lines.push("No products found.");
        return structured(out, lines.join("\n"));
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_list_plans ────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_plans",
      description:
        "Admin: list the school's subscription plans (plan_name, price, duration_in_days, provider) with the course IDs each covers. Soft-deleted plans are hidden unless include_deleted is true.",
      inputSchema: listPlansInput,
      outputSchema: plansOutput,
      annotations: READ_ONLY,
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const supabase = session.getClient();

        let query = supabase
          .from("plans")
          .select("plan_id, plan_name, price, currency, duration_in_days, payment_provider, deleted_at", {
            count: "exact",
          })
          .eq("tenant_id", session.getTenantId())
          .order("plan_id", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (!input.include_deleted) query = query.is("deleted_at", null);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing plans: ${error.message}`);
        const rows = data ?? [];

        // `plan_courses` has no tenant_id — scoped by the tenant's own plan ids.
        const courseIds = new Map<number, number[]>();
        if (rows.length > 0) {
          const { data: links, error: linkError } = await supabase
            .from("plan_courses")
            .select("plan_id, course_id")
            .in(
              "plan_id",
              rows.map((r) => r.plan_id)
            );
          if (linkError) return errorResult(`Loading plan courses: ${linkError.message}`);
          for (const l of links ?? []) {
            courseIds.set(l.plan_id, [...(courseIds.get(l.plan_id) ?? []), l.course_id]);
          }
        }

        const plans = rows.map((p) => ({
          plan_id: p.plan_id as number,
          plan_name: p.plan_name as string,
          price: num(p.price),
          currency: (p.currency as string | null) ?? null,
          duration_in_days: num(p.duration_in_days),
          payment_provider: (p.payment_provider as string | null) ?? null,
          deleted_at: (p.deleted_at as string | null) ?? null,
          course_ids: courseIds.get(p.plan_id) ?? [],
        }));
        const out = { ...page(count ?? plans.length, input.offset, plans.length), plans };

        const lines = [`# Plans (${plans.length} of ${out.total})`, ""];
        for (const p of plans) {
          lines.push(
            `- **${p.plan_name}** (#${p.plan_id}) — ${money(p.price, p.currency)} / ${p.duration_in_days ?? "?"} days via ${p.payment_provider ?? "?"}${p.deleted_at ? " [deleted]" : ""}; courses: ${p.course_ids.join(", ") || "none"}`
          );
        }
        if (plans.length === 0) lines.push("No plans found.");
        return structured(out, lines.join("\n"));
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_list_payment_requests ─────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_payment_requests",
      description:
        "Admin: list manual/offline payment requests (bank transfers etc.). Default shows the open queue (pending → contacted → payment_received). Shows what the student reported paying (reference, amount) next to what was asked.",
      inputSchema: listPaymentRequestsInput,
      outputSchema: paymentRequestsOutput,
      annotations: READ_ONLY,
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        let query = session
          .getClient()
          .from("payment_requests")
          .select(
            "request_id, status, user_id, contact_name, contact_email, product_id, plan_id, payment_amount, payment_currency, payment_method, payment_reference, reported_amount, reported_currency, payment_reported_at, payment_confirmed_at, created_at, expires_at, admin_notes, product:products(name), plan:plans(plan_name)",
            { count: "exact" }
          )
          .eq("tenant_id", session.getTenantId())
          .order("created_at", { ascending: false })
          .order("request_id", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (input.status === "open") query = query.in("status", [...OPEN_PAYMENT_REQUEST_STATUSES]);
        else if (input.status !== "all") query = query.eq("status", input.status);
        if (input.user_id) query = query.eq("user_id", input.user_id);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing payment requests: ${error.message}`);

        const requests = (data ?? []).map((r) => {
          const product = embedded(r.product as { name: string } | { name: string }[] | null);
          const plan = embedded(r.plan as { plan_name: string } | { plan_name: string }[] | null);
          return {
            request_id: r.request_id as number,
            status: r.status as string,
            user_id: r.user_id as string,
            contact_name: (r.contact_name as string | null) ?? null,
            contact_email: (r.contact_email as string | null) ?? null,
            item: product?.name ?? plan?.plan_name ?? null,
            product_id: (r.product_id as number | null) ?? null,
            plan_id: (r.plan_id as number | null) ?? null,
            amount: num(r.payment_amount),
            currency: (r.payment_currency as string | null) ?? null,
            payment_method: (r.payment_method as string | null) ?? null,
            payment_reference: (r.payment_reference as string | null) ?? null,
            reported_amount: num(r.reported_amount),
            reported_currency: (r.reported_currency as string | null) ?? null,
            payment_reported_at: (r.payment_reported_at as string | null) ?? null,
            payment_confirmed_at: (r.payment_confirmed_at as string | null) ?? null,
            created_at: (r.created_at as string | null) ?? null,
            expires_at: (r.expires_at as string | null) ?? null,
            admin_notes: (r.admin_notes as string | null) ?? null,
          };
        });
        const out = { ...page(count ?? requests.length, input.offset, requests.length), requests };

        const lines = [`# Payment requests — ${input.status} (${requests.length} of ${out.total})`, ""];
        for (const r of requests) {
          const reported = r.payment_reported_at
            ? `; student reported ${money(r.reported_amount, r.reported_currency ?? r.currency)}${r.payment_reference ? ` ref ${r.payment_reference}` : ""}`
            : "";
          lines.push(
            `- #${r.request_id} [${r.status}] **${r.contact_name ?? r.user_id}** — ${r.item ?? "?"} ${money(r.amount, r.currency)}${reported}`
          );
        }
        if (requests.length === 0) lines.push("No payment requests found.");
        return structured(out, lines.join("\n"));
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_confirm_payment_received ──────────────────────────────────────────
  server.tool(
    {
      name: "lms_confirm_payment_received",
      description:
        "Admin: record that the money for a manual payment request arrived (status → payment_received). Only after you have checked the school's bank/wallet statement — the student's own report is not proof. This does NOT yet grant course access: completing the sale (transaction + enrollment) is finished in the dashboard (Payment requests → Enroll), since sales are written server-side only.",
      inputSchema: confirmPaymentInput,
      outputSchema: transitionOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const { data: request, error: readError } = await supabase
          .from("payment_requests")
          .select("request_id, status, user_id, product:products(name), plan:plans(plan_name)")
          .eq("request_id", input.request_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (readError) return errorResult(`Loading payment request: ${readError.message}`);
        if (!request) return errorResult(`Payment request ${input.request_id} not found`);

        const previous = request.status as string;
        const refusal = paymentRequestTransitionError("confirm", previous);
        if (refusal) return errorResult(refusal);
        const nextStep = `Complete it in the dashboard (Payment requests → #${input.request_id} → Enroll) to record the sale and grant access.`;

        if (previous === "payment_received") {
          return structured(
            {
              request_id: input.request_id,
              previous_status: previous,
              status: previous,
              changed: false,
              student_notified: false,
              next_step: nextStep,
            },
            `Request #${input.request_id} was already marked as paid. ${nextStep}`
          );
        }

        const now = new Date().toISOString();
        // Conditional on the status we just read, so a concurrent change (the
        // expiry cron, another admin) makes this a no-op instead of a rewrite.
        const { data: updated, error } = await supabase
          .from("payment_requests")
          .update({
            status: "payment_received",
            payment_confirmed_at: now,
            ...(input.admin_notes ? { admin_notes: input.admin_notes } : {}),
            processed_by: session.getUserId(),
            updated_at: now,
          })
          .eq("request_id", input.request_id)
          .eq("tenant_id", tenantId)
          .eq("status", previous)
          .select("request_id");
        if (error) return errorResult(`Confirming payment: ${error.message}`);
        if (!updated?.length) {
          return errorResult(
            `Request #${input.request_id} changed while confirming (or you lack permission). Re-read it with lms_list_payment_requests.`
          );
        }

        const product = embedded(request.product as { name: string } | { name: string }[] | null);
        const plan = embedded(request.plan as { plan_name: string } | { plan_name: string }[] | null);
        const notified = await notifyStudent(
          session,
          request.user_id as string,
          product?.name ?? plan?.plan_name ?? "your purchase",
          "payment received"
        );

        return structured(
          {
            request_id: input.request_id,
            previous_status: previous,
            status: "payment_received",
            changed: true,
            student_notified: notified,
            next_step: nextStep,
          },
          `Request #${input.request_id}: ${previous} → payment_received.${notified ? " Student notified." : ""} ${nextStep}`
        );
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_reject_payment_request ────────────────────────────────────────────
  server.tool(
    {
      name: "lms_reject_payment_request",
      description:
        "Admin: reject (cancel) a manual payment request that is still open — e.g. the transfer never arrived or the amount is wrong. The student is notified. A completed request cannot be rejected (access was already granted). If money was received, refund it outside the platform.",
      inputSchema: rejectPaymentInput,
      outputSchema: transitionOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const { data: request, error: readError } = await supabase
          .from("payment_requests")
          .select("request_id, status, user_id, product:products(name), plan:plans(plan_name)")
          .eq("request_id", input.request_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (readError) return errorResult(`Loading payment request: ${readError.message}`);
        if (!request) return errorResult(`Payment request ${input.request_id} not found`);

        const previous = request.status as string;
        const refusal = paymentRequestTransitionError("reject", previous);
        if (refusal) return errorResult(refusal);

        if (previous === "cancelled") {
          return structured(
            {
              request_id: input.request_id,
              previous_status: previous,
              status: previous,
              changed: false,
              student_notified: false,
              next_step: null,
            },
            `Request #${input.request_id} was already cancelled.`
          );
        }

        const { data: updated, error } = await supabase
          .from("payment_requests")
          .update({
            status: "cancelled",
            ...(input.reason ? { admin_notes: input.reason } : {}),
            processed_by: session.getUserId(),
            updated_at: new Date().toISOString(),
          })
          .eq("request_id", input.request_id)
          .eq("tenant_id", tenantId)
          .eq("status", previous)
          .select("request_id");
        if (error) return errorResult(`Rejecting payment request: ${error.message}`);
        if (!updated?.length) {
          return errorResult(
            `Request #${input.request_id} changed while rejecting (or you lack permission). Re-read it with lms_list_payment_requests.`
          );
        }

        const product = embedded(request.product as { name: string } | { name: string }[] | null);
        const plan = embedded(request.plan as { plan_name: string } | { plan_name: string }[] | null);
        const notified = await notifyStudent(
          session,
          request.user_id as string,
          product?.name ?? plan?.plan_name ?? "your purchase",
          "cancelled"
        );

        return structured(
          {
            request_id: input.request_id,
            previous_status: previous,
            status: "cancelled",
            changed: true,
            student_notified: notified,
            next_step:
              previous === "payment_received"
                ? "Money was marked as received — refund the student outside the platform."
                : null,
          },
          `Request #${input.request_id}: ${previous} → cancelled.${notified ? " Student notified." : ""}${previous === "payment_received" ? " Money was marked as received — refund it outside the platform." : ""}`
        );
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_list_transactions ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_transactions",
      description:
        "Admin: list the school's sales (transactions), newest first, with amount, refunded amount and net (amount − refunded). A partial refund stays 'successful'; 'refunded' means fully refunded. Page totals are net of refunds over successful rows on this page only — use lms_get_payouts_owed for all-time totals. Read-only: sales are written server-side only.",
      inputSchema: listTransactionsInput,
      outputSchema: transactionsOutput,
      annotations: READ_ONLY,
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        // `transactions` has no created_at — the date column is transaction_date.
        let query = supabase
          .from("transactions")
          .select(
            "transaction_id, transaction_date, user_id, product_id, plan_id, amount, refunded_amount, currency, status, payment_provider",
            { count: "exact" }
          )
          .eq("tenant_id", tenantId)
          .order("transaction_date", { ascending: false })
          .order("transaction_id", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (input.status) query = query.eq("status", input.status);
        if (input.payment_provider) query = query.eq("payment_provider", input.payment_provider);
        if (input.user_id) query = query.eq("user_id", input.user_id);
        if (input.product_id) query = query.eq("product_id", input.product_id);
        if (input.plan_id) query = query.eq("plan_id", input.plan_id);
        if (input.from) query = query.gte("transaction_date", new Date(input.from).toISOString());
        if (input.to) query = query.lt("transaction_date", new Date(input.to).toISOString());

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing transactions: ${error.message}`);
        const rows = data ?? [];

        const productIds = [...new Set(rows.map((r) => r.product_id).filter((v): v is number => v != null))];
        const planIds = [...new Set(rows.map((r) => r.plan_id).filter((v): v is number => v != null))];
        const [names, products, plans] = await Promise.all([
          fetchProfileNames(supabase, rows.map((r) => r.user_id as string)),
          productIds.length
            ? supabase.from("products").select("product_id, name").eq("tenant_id", tenantId).in("product_id", productIds)
            : Promise.resolve({ data: [] as { product_id: number; name: string }[] }),
          planIds.length
            ? supabase.from("plans").select("plan_id, plan_name").eq("tenant_id", tenantId).in("plan_id", planIds)
            : Promise.resolve({ data: [] as { plan_id: number; plan_name: string }[] }),
        ]);
        const productName = new Map((products.data ?? []).map((p) => [p.product_id as number, p.name as string]));
        const planName = new Map((plans.data ?? []).map((p) => [p.plan_id as number, p.plan_name as string]));

        const transactions = rows.map((t) => {
          const amount = Number(t.amount ?? 0);
          const refunded = Number(t.refunded_amount ?? 0);
          return {
            transaction_id: t.transaction_id as number,
            transaction_date: t.transaction_date as string,
            user_id: t.user_id as string,
            student_name: names.get(t.user_id as string) ?? null,
            item:
              (t.product_id != null ? productName.get(t.product_id) : undefined) ??
              (t.plan_id != null ? planName.get(t.plan_id) : undefined) ??
              null,
            product_id: (t.product_id as number | null) ?? null,
            plan_id: (t.plan_id as number | null) ?? null,
            status: t.status as string,
            payment_provider: (t.payment_provider as string | null) ?? null,
            currency: (t.currency as string | null) ?? null,
            amount,
            refunded_amount: refunded,
            net_amount: roundMoney(netOfRefunds(amount, refunded)),
          };
        });

        const totals = new Map<string, { successful_net: number; count: number }>();
        for (const t of transactions) {
          if (t.status !== "successful") continue;
          const key = t.currency ?? "usd";
          const entry = totals.get(key) ?? { successful_net: 0, count: 0 };
          entry.successful_net += t.net_amount;
          entry.count += 1;
          totals.set(key, entry);
        }
        const page_totals = [...totals.entries()].map(([currency, e]) => ({
          currency,
          successful_net: roundMoney(e.successful_net),
          count: e.count,
        }));

        const out = {
          ...page(count ?? transactions.length, input.offset, transactions.length),
          transactions,
          page_totals,
        };

        const lines = [`# Transactions (${transactions.length} of ${out.total})`, ""];
        for (const t of transactions) {
          const refund = t.refunded_amount > 0 ? ` (refunded ${t.refunded_amount.toFixed(2)})` : "";
          lines.push(
            `- #${t.transaction_id} ${t.transaction_date.slice(0, 10)} [${t.status}] ${t.student_name ?? t.user_id} — ${t.item ?? "?"} ${money(t.amount, t.currency)}${refund} via ${t.payment_provider ?? "?"}`
          );
        }
        if (transactions.length === 0) lines.push("No transactions found.");
        if (page_totals.length) {
          lines.push("", "Page totals (successful, net of refunds): " + page_totals.map((p) => money(p.successful_net, p.currency)).join(", "));
        }
        return structured(out, lines.join("\n"));
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_list_subscriptions ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_subscriptions",
      description:
        "Admin: list student subscriptions to the school's plans, newest first. 'live' = active, renewed or past_due (all still grant access). cancel_at_period_end is the only signal that a cancel is scheduled.",
      inputSchema: listSubscriptionsInput,
      outputSchema: subscriptionsOutput,
      annotations: READ_ONLY,
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        let query = session
          .getClient()
          .from("subscriptions")
          .select(
            "subscription_id, user_id, plan_id, subscription_status, payment_provider, current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at, created, profiles!subscriptions_user_profile_fkey(full_name), plans(plan_name)",
            { count: "exact" }
          )
          .eq("tenant_id", session.getTenantId())
          .order("created", { ascending: false })
          .order("subscription_id", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (input.status === "live") query = query.in("subscription_status", [...LIVE_SUBSCRIPTION_STATUSES]);
        else if (input.status !== "all") query = query.eq("subscription_status", input.status);
        if (input.user_id) query = query.eq("user_id", input.user_id);
        if (input.plan_id) query = query.eq("plan_id", input.plan_id);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing subscriptions: ${error.message}`);

        const live = new Set<string>(LIVE_SUBSCRIPTION_STATUSES);
        const subscriptions = (data ?? []).map((s) => {
          const profile = embedded(
            s.profiles as { full_name: string | null } | { full_name: string | null }[] | null
          );
          const plan = embedded(s.plans as { plan_name: string } | { plan_name: string }[] | null);
          const status = s.subscription_status as string;
          return {
            subscription_id: s.subscription_id as number,
            user_id: s.user_id as string,
            student_name: profile?.full_name?.trim() || null,
            plan_id: s.plan_id as number,
            plan_name: plan?.plan_name ?? null,
            subscription_status: status,
            live: live.has(status),
            payment_provider: (s.payment_provider as string | null) ?? null,
            current_period_start: (s.current_period_start as string | null) ?? null,
            current_period_end: (s.current_period_end as string | null) ?? null,
            cancel_at_period_end: s.cancel_at_period_end === true,
            cancel_at: (s.cancel_at as string | null) ?? null,
            canceled_at: (s.canceled_at as string | null) ?? null,
            created: (s.created as string | null) ?? null,
          };
        });
        const out = { ...page(count ?? subscriptions.length, input.offset, subscriptions.length), subscriptions };

        const lines = [`# Subscriptions — ${input.status} (${subscriptions.length} of ${out.total})`, ""];
        for (const s of subscriptions) {
          const ends = s.current_period_end ? ` — period ends ${s.current_period_end.slice(0, 10)}` : "";
          const cancel = s.cancel_at_period_end ? " (cancels at period end)" : "";
          lines.push(
            `- #${s.subscription_id} [${s.subscription_status}] ${s.student_name ?? s.user_id} — ${s.plan_name ?? `plan ${s.plan_id}`} via ${s.payment_provider ?? "?"}${ends}${cancel}`
          );
        }
        if (subscriptions.length === 0) lines.push("No subscriptions found.");
        return structured(out, lines.join("\n"));
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_get_payouts_owed ──────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_payouts_owed",
      description:
        "Admin: the school's all-time revenue per currency (gross net of refunds, platform fees, the school's share) and what the platform still owes the school for sales collected into the platform's account (PayPal, Lemon Squeezy, Binance Pay), minus manual payouts already paid. Stripe Connect, Solana, manual and Binance personal sales go straight to the school and are never 'owed'. Never sums across currencies.",
      inputSchema: emptyInput,
      outputSchema: payoutsOutput,
      annotations: READ_ONLY,
    },
    async (_input, ctx) => {
      try {
        const session = adminSession(ctx);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const [splitResult, txns, paid, recent] = await Promise.all([
          supabase.from("revenue_splits").select("school_percentage").eq("tenant_id", tenantId).maybeSingle(),
          fetchAllPages<{
            amount: number;
            refunded_amount: number | null;
            currency: string | null;
            payment_provider: string | null;
            stripe_payment_intent_id: string | null;
            school_percentage_snapshot: number | null;
          }>("transactions", (from, to) =>
            supabase
              .from("transactions")
              .select(
                "amount, refunded_amount, currency, payment_provider, stripe_payment_intent_id, school_percentage_snapshot",
                { count: "exact" }
              )
              .eq("tenant_id", tenantId)
              .eq("status", "successful")
              .order("transaction_id")
              .range(from, to)
          ),
          fetchAllPages<{ amount: number; currency: string | null }>("payouts", (from, to) =>
            supabase
              .from("payouts")
              .select("amount, currency", { count: "exact" })
              .eq("tenant_id", tenantId)
              .eq("payout_method", "manual")
              .eq("status", "paid")
              .order("payout_id")
              .range(from, to)
          ),
          supabase
            .from("payouts")
            .select("payout_id, amount, currency, status, payout_method, period_start, period_end, paid_at, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);
        if (splitResult.error) return errorResult(`Loading revenue split: ${splitResult.error.message}`);
        if (recent.error) return errorResult(`Loading payouts: ${recent.error.message}`);

        // `??`, never `||`: a 0% school share is a real value.
        const schoolPercentage = num(splitResult.data?.school_percentage) ?? DEFAULT_SCHOOL_PERCENTAGE;
        const currencies = computeSchoolRevenue(
          txns.map((t) => ({
            amount: Number(t.amount),
            refundedAmount: num(t.refunded_amount),
            currency: t.currency,
            paymentProvider: t.payment_provider,
            stripePaymentIntentId: t.stripe_payment_intent_id,
            schoolPercentageSnapshot: num(t.school_percentage_snapshot),
          })),
          paid.map((p) => ({ amount: Number(p.amount), currency: p.currency })),
          schoolPercentage
        );

        const recent_payouts = (recent.data ?? []).map((p) => ({
          payout_id: p.payout_id as number,
          amount: Number(p.amount),
          currency: (p.currency as string | null) ?? null,
          status: p.status as string,
          payout_method: (p.payout_method as string | null) ?? null,
          period_start: (p.period_start as string | null) ?? null,
          period_end: (p.period_end as string | null) ?? null,
          paid_at: (p.paid_at as string | null) ?? null,
          created_at: (p.created_at as string | null) ?? null,
        }));

        const lines = [`# Revenue & payouts owed (school share ${schoolPercentage}% unless a sale snapshotted another)`, ""];
        for (const c of currencies) {
          const cur = c.currency.toUpperCase();
          lines.push(
            `## ${cur}`,
            `- Gross (net of refunds): ${c.gross_revenue.toFixed(2)} over ${c.transactions} sale(s)`,
            `- Platform fees: ${c.platform_fees.toFixed(2)} — school's share: ${c.school_revenue.toFixed(2)}`,
            `- Collected into the platform account: ${c.platform_collected.toFixed(2)} → owed ${c.owed_gross.toFixed(2)}, already paid ${c.already_paid.toFixed(2)}`,
            `- **Outstanding: ${c.net_owed.toFixed(2)} ${cur}**${c.overpaid > 0 ? ` (overpaid by ${c.overpaid.toFixed(2)}, carried forward)` : ""}`,
            ""
          );
        }
        if (currencies.length === 0) lines.push("No successful sales or payouts yet.");
        return structured({ school_percentage: schoolPercentage, currencies, recent_payouts }, lines.join("\n"));
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );

  // ── lms_get_billing_status ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_billing_status",
      description:
        "Admin: the school's own platform billing — current plan, billing status, subscription (provider, interval, period, scheduled cancel, grace period), access cut-off, plan usage vs limits (-1 = unlimited), the platform transaction fee, and recent platform payment requests (manual/crypto renewals).",
      inputSchema: emptyInput,
      outputSchema: billingOutput,
      annotations: READ_ONLY,
    },
    async (_input, ctx) => {
      try {
        const session = adminSession(ctx);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const [tenantResult, subResult, featuresResult, usage, requestsResult] = await Promise.all([
          supabase
            .from("tenants")
            .select("name, plan, billing_status, billing_period_end, access_cutoff_at")
            .eq("id", tenantId)
            .maybeSingle(),
          supabase
            .from("platform_subscriptions")
            .select(
              "status, payment_provider, interval, cancel_at_period_end, current_period_start, current_period_end, grace_period_end"
            )
            .eq("tenant_id", tenantId)
            .maybeSingle(),
          supabase.rpc("get_plan_features", { _tenant_id: tenantId }),
          getTenantPlanUsage(supabase, tenantId),
          supabase
            .from("platform_payment_requests")
            .select("request_id, status, amount, currency, interval, payment_provider, created_at, expires_at, platform_plans(name)")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);
        if (tenantResult.error) return errorResult(`Loading school: ${tenantResult.error.message}`);
        if (subResult.error) return errorResult(`Loading platform subscription: ${subResult.error.message}`);
        if (requestsResult.error) return errorResult(`Loading platform payment requests: ${requestsResult.error.message}`);

        const tenant = tenantResult.data;
        const planSlug = (tenant?.plan as string | null) || "free";
        // get_plan_features filters is_active and falls back to Free, so its
        // name/fee only describe THIS school when the slugs agree.
        const features = (featuresResult.data ?? {}) as {
          plan?: string;
          plan_name?: string;
          transaction_fee_percent?: number | string;
        };
        const sameSlug = features.plan === planSlug;
        const sub = subResult.data;

        const out = {
          school_name: (tenant?.name as string | null) ?? null,
          plan: planSlug,
          plan_name: sameSlug ? (features.plan_name ?? null) : null,
          billing_status: (tenant?.billing_status as string | null) || "free",
          billing_period_end: (tenant?.billing_period_end as string | null) ?? null,
          access_cutoff_at: (tenant?.access_cutoff_at as string | null) ?? null,
          transaction_fee_percent: sameSlug ? num(features.transaction_fee_percent) : null,
          subscription: sub
            ? {
                status: sub.status as string,
                payment_provider: sub.payment_provider as string,
                interval: sub.interval as string,
                cancel_at_period_end: sub.cancel_at_period_end === true,
                current_period_start: (sub.current_period_start as string | null) ?? null,
                current_period_end: (sub.current_period_end as string | null) ?? null,
                grace_period_end: (sub.grace_period_end as string | null) ?? null,
              }
            : null,
          usage: usage
            ? {
                courses: usage.courses,
                max_courses: usage.max_courses,
                students: usage.students,
                max_students: usage.max_students,
              }
            : null,
          recent_platform_payment_requests: (requestsResult.data ?? []).map((r) => ({
            request_id: r.request_id as string,
            status: r.status as string,
            plan: embedded(r.platform_plans as { name: string } | { name: string }[] | null)?.name ?? null,
            amount: num(r.amount),
            currency: (r.currency as string | null) ?? null,
            interval: (r.interval as string | null) ?? null,
            payment_provider: (r.payment_provider as string | null) ?? null,
            created_at: (r.created_at as string | null) ?? null,
            expires_at: (r.expires_at as string | null) ?? null,
          })),
        };

        const limit = (v: number) => (v < 0 ? "unlimited" : String(v));
        const lines = [
          `# Platform billing — ${out.school_name ?? "this school"}`,
          `- Plan: **${out.plan_name ?? out.plan}** (${out.plan}) — billing status: ${out.billing_status}`,
          out.transaction_fee_percent !== null ? `- Platform fee on student sales: ${out.transaction_fee_percent}%` : "",
          out.subscription
            ? `- Subscription: ${out.subscription.status} via ${out.subscription.payment_provider}, ${out.subscription.interval}; period ends ${out.subscription.current_period_end ?? "?"}${out.subscription.cancel_at_period_end ? " (cancels at period end)" : ""}${out.subscription.grace_period_end ? `; grace until ${out.subscription.grace_period_end}` : ""}`
            : "- No platform subscription on file.",
          out.access_cutoff_at ? `- **Access cut-off scheduled: ${out.access_cutoff_at}**` : "",
          out.usage
            ? `- Usage: ${out.usage.courses}/${limit(out.usage.max_courses)} courses, ${out.usage.students}/${limit(out.usage.max_students)} students`
            : "",
        ].filter(Boolean);
        if (out.recent_platform_payment_requests.length) {
          lines.push("", "Recent platform payment requests:");
          for (const r of out.recent_platform_payment_requests) {
            lines.push(`- [${r.status}] ${r.plan ?? "?"} ${r.interval ?? ""} ${money(r.amount, r.currency)} via ${r.payment_provider ?? "?"} — ${r.created_at?.slice(0, 10) ?? ""}`);
          }
        }
        return structured(out, lines.join("\n"));
      } catch (err) {
        return errorResult(message(err));
      }
    }
  );
}
