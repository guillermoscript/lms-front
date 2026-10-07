/**
 * Product tools: admin-only gating, input schemas, and handler guards.
 * Handlers run against a scripted fake of the request-scoped Supabase client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: unknown };
interface FakeCall { table: string; ops: [string, ...unknown[]][] }

let fake: ReturnType<typeof makeFake>;

function makeFake(script: Record<string, Result[]>) {
  const calls: FakeCall[] = [];
  const from = (table: string) => {
    const call: FakeCall = { table, ops: [] };
    calls.push(call);
    const next = (): Result => {
      const r = script[table]?.shift() ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "order", "range", "update", "insert", "delete"]) {
      chain[m] = (...a: unknown[]) => { call.ops.push([m, ...a]); return chain; };
    }
    chain.maybeSingle = () => Promise.resolve(next());
    chain.single = () => Promise.resolve(next());
    chain.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(res, rej);
    return chain;
  };
  return { client: { from, rpc: vi.fn(), auth: {} }, calls };
}

vi.mock("../src/supabase.js", () => ({
  createUserClient: () => fake.client,
  getServiceClient: () => null,
}));

const { isToolAllowedForRole } = await import("../src/tool-policy.js");
const products = await import("../src/tools/products.js");

type Handler = (input: unknown, ctx: unknown) => Promise<{ isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, unknown> }>;
const handlers = new Map<string, Handler>();
products.registerProductTools({
  tool: (def: { name: string }, cb: Handler) => { handlers.set(def.name, cb); return { name: def.name }; },
} as never);

const TENANT = "00000000-0000-0000-0000-000000000001";
const ctxFor = (role: string) => ({
  auth: { user: { id: "11111111-1111-1111-1111-111111111111" }, accessToken: "t", payload: { tenant_id: TENANT, tenant_role: role } },
});
const text = (r: { content?: { text?: string }[] }) => r.content?.[0]?.text ?? "";

const ADMIN_ONLY = ["lms_list_products", "lms_get_product", "lms_create_product", "lms_update_product", "lms_archive_product", "lms_restore_product"];

describe("product tool policy", () => {
  it("registers products + categories", () => {
    expect([...handlers.keys()].sort()).toEqual([...ADMIN_ONLY, "lms_list_course_categories"].sort());
  });
  it("product tools are admin-only; categories open to teachers", () => {
    for (const n of ADMIN_ONLY) {
      expect(isToolAllowedForRole("admin", n)).toBe(true);
      expect(isToolAllowedForRole("teacher", n)).toBe(false);
      expect(isToolAllowedForRole("student", n)).toBe(false);
    }
    expect(isToolAllowedForRole("teacher", "lms_list_course_categories")).toBe(true);
    expect(isToolAllowedForRole("student", "lms_list_course_categories")).toBe(false);
  });
});

describe("input schemas", () => {
  const base = { name: "Pack", price: 10, course_ids: [1] };
  it("requires price > 0, a course and a supported currency/provider", () => {
    expect(products.createProductInput.safeParse(base).success).toBe(true);
    expect(products.createProductInput.safeParse({ ...base, price: 0 }).success).toBe(false);
    expect(products.createProductInput.safeParse({ ...base, course_ids: [] }).success).toBe(false);
    expect(products.createProductInput.safeParse({ ...base, currency: "mxn" }).success).toBe(false);
    expect(products.createProductInput.safeParse({ ...base, payment_provider: "stripe" }).success).toBe(false);
    expect(products.createProductInput.parse(base).payment_provider).toBe("manual");
  });
});

describe("handlers", () => {
  beforeEach(() => { fake = makeFake({}); });

  it("refuses a teacher before touching the database", async () => {
    const r = await handlers.get("lms_create_product")!({ name: "x", price: 5, course_ids: [1] }, ctxFor("teacher"));
    expect(r.isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses courses outside the tenant", async () => {
    fake = makeFake({ courses: [{ data: [] }] });
    const r = await handlers.get("lms_create_product")!({ name: "x", price: 5, currency: "usd", course_ids: [9], payment_provider: "manual" }, ctxFor("admin"));
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("not found in this school");
    expect(fake.calls.some((c) => c.table === "products")).toBe(false);
  });

  it("creates product active, tenant-scoped, then links courses", async () => {
    fake = makeFake({
      courses: [{ data: [{ course_id: 1 }, { course_id: 2 }] }],
      products: [{ data: { product_id: 7, name: "x", price: 5, currency: "usd", status: "active", payment_provider: "manual", tenant_id: TENANT } }],
      product_courses: [{ data: null }],
    });
    const r = await handlers.get("lms_create_product")!({ name: "x", price: 5, currency: "usd", course_ids: [1, 2, 2], payment_provider: "manual" }, ctxFor("admin"));
    expect(r.isError).toBeUndefined();
    const ins = fake.calls.find((c) => c.table === "products")!.ops.find((o) => o[0] === "insert")![1] as Record<string, unknown>;
    expect(ins).toMatchObject({ status: "active", tenant_id: TENANT, price: 5, payment_provider: "manual" });
    const links = fake.calls.find((c) => c.table === "product_courses")!.ops.find((o) => o[0] === "insert")![1] as unknown[];
    expect(links).toHaveLength(2);
  });

  it("lemonsqueezy needs a variant id; solana needs a wallet", async () => {
    fake = makeFake({ courses: [{ data: [{ course_id: 1 }] }] });
    let r = await handlers.get("lms_create_product")!({ name: "x", price: 5, currency: "usd", course_ids: [1], payment_provider: "lemonsqueezy" }, ctxFor("admin"));
    expect(text(r)).toContain("provider_price_id");
    fake = makeFake({ courses: [{ data: [{ course_id: 1 }] }], tenant_payment_wallets: [{ data: null }] });
    r = await handlers.get("lms_create_product")!({ name: "x", price: 5, currency: "usd", course_ids: [1], payment_provider: "solana" }, ctxFor("admin"));
    expect(text(r)).toContain("wallet");
  });

  it("stripe products only allow re-linking courses; archive is refused", async () => {
    const stripe = { product_id: 3, name: "s", price: 9, currency: "usd", status: "active", payment_provider: "stripe", tenant_id: TENANT };
    fake = makeFake({ products: [{ data: stripe }] });
    let r = await handlers.get("lms_update_product")!({ product_id: 3, price: 12 }, ctxFor("admin"));
    expect(r.isError).toBe(true);
    fake = makeFake({ products: [{ data: stripe }] });
    r = await handlers.get("lms_archive_product")!({ product_id: 3 }, ctxFor("admin"));
    expect(r.isError).toBe(true);
    expect(fake.calls.every((c) => !c.ops.some((o) => o[0] === "update"))).toBe(true);
  });

  it("archive sets status inactive for a manual product", async () => {
    const manual = { product_id: 4, name: "m", price: 9, currency: "usd", status: "active", payment_provider: "manual", tenant_id: TENANT };
    fake = makeFake({ products: [{ data: manual }, { data: { ...manual, status: "inactive" } }], product_courses: [{ data: [{ course_id: 1 }] }] });
    const r = await handlers.get("lms_archive_product")!({ product_id: 4 }, ctxFor("admin"));
    expect(r.isError).toBeUndefined();
    const upd = fake.calls.filter((c) => c.table === "products")[1].ops.find((o) => o[0] === "update")![1];
    expect(upd).toEqual({ status: "inactive" });
  });
});
