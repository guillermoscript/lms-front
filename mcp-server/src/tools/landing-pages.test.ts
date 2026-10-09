/**
 * Landing-page tools (Page Architect MCP parity, WP6): policy, the create → patch → publish
 * lifecycle on the shared @lms/core page-builder, zones, tenant refs, CAS and the free cap.
 *
 * Handlers run against a small in-memory fake of the request-scoped Supabase client
 * (`createUserClient` is mocked) that applies eq/in/is filters, so a write that would
 * target another tenant's row or a foreign id behaves as it would under RLS + the
 * explicit tenant filters.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT_ZONE, findNode, getTemplate, pageCatalog, type PageData } from "@lms/core";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const TENANT = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-0000000000aa";

let db: Record<string, Row[]>;
let plan = "free";
let writes: { table: string; op: string; filters: string[] }[];

const same = (a: unknown, b: unknown) => a === b || (a != null && b != null && String(a) === String(b));

function from(table: string) {
  const filters: Filter[] = [];
  const described: string[] = [];
  let op: "select" | "update" | "insert" | "delete" = "select";
  let patch: Row = {};
  let inserted: Row[] = [];
  let head = false;
  let wantCount = false;

  const exec = () => {
    const rows = (db[table] ??= []);
    const match = () => rows.filter((r) => filters.every((f) => f(r)));
    if (op === "insert") {
      const out = inserted.map((r, i) => ({
        page_id: `11111111-0000-4000-8000-00000000000${rows.length + i + 1}`,
        created_at: "2026-10-08T10:00:00.000000+00:00",
        updated_at: "2026-10-08T10:00:00.123456+00:00",
        ...structuredClone(r),
      }));
      rows.push(...out);
      writes.push({ table, op, filters: described });
      return { data: structuredClone(out), error: null, count: null };
    }
    if (op === "update") {
      const hit = match();
      for (const r of hit) Object.assign(r, structuredClone(patch));
      writes.push({ table, op, filters: described });
      return { data: structuredClone(hit), error: null, count: null };
    }
    if (op === "delete") {
      const hit = new Set(match());
      db[table] = rows.filter((r) => !hit.has(r));
      writes.push({ table, op, filters: described });
      return { data: null, error: null, count: null };
    }
    const hit = match();
    return { data: head ? null : structuredClone(hit), error: null, count: wantCount ? hit.length : null };
  };

  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) wantCount = true;
      if (opts?.head) head = true;
      return chain;
    },
    eq: (col: string, v: unknown) => {
      described.push(`eq:${col}`);
      filters.push((r) => same(r[col], v));
      return chain;
    },
    in: (col: string, vs: unknown[]) => {
      described.push(`in:${col}`);
      filters.push((r) => vs.some((v) => same(r[col], v)));
      return chain;
    },
    is: (col: string, v: unknown) => {
      described.push(`is:${col}`);
      filters.push((r) => (v === null ? r[col] == null : r[col] === v));
      return chain;
    },
    order: () => chain,
    range: () => chain,
    limit: () => chain,
    update: (p: Row) => {
      op = "update";
      patch = p;
      return chain;
    },
    insert: (r: Row | Row[]) => {
      op = "insert";
      inserted = Array.isArray(r) ? r : [r];
      return chain;
    },
    delete: () => {
      op = "delete";
      return chain;
    },
    maybeSingle: () => {
      const r = exec();
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    },
    single: () => {
      const r = exec();
      const first = Array.isArray(r.data) ? r.data[0] : r.data;
      return Promise.resolve(first ? { ...r, data: first } : { data: null, error: { message: "no rows" }, count: null });
    },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
  };
  return chain;
}

const client = {
  from,
  rpc: vi.fn(async (name: string) =>
    name === "get_plan_features" ? { data: { plan }, error: null } : { data: null, error: null }
  ),
  auth: {},
};

vi.mock("../supabase.js", () => ({
  createUserClient: () => client,
  getServiceClient: () => null,
}));

const { isToolAllowedForRole } = await import("../tool-policy.js");
const { registerLandingPageTools } = await import("./landing-pages.js");
const { registerPlanTools } = await import("./plans.js");
const { applyAgentOps, sameTimestamp, emptyRefLookup } = await import("../landing/page-builder.js");
const { summarizeSection } = await import("../landing/preview.js");

type Result = {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};
type Def = { name: string; inputSchema?: { parse: (v: unknown) => unknown } };
const tools = new Map<string, { def: Def; cb: (input: unknown, ctx: unknown) => Promise<Result> }>();
const fakeServer = {
  tool: (def: Def, cb: (input: unknown, ctx: unknown) => Promise<Result>) => {
    tools.set(def.name, { def, cb });
    return { name: def.name };
  },
} as never;
let seq = 0;
registerLandingPageTools(fakeServer, { idFactory: (type) => `${type}-s${++seq}` });
registerPlanTools(fakeServer);

const ctxFor = (role: string) => ({
  auth: {
    user: { id: "22222222-2222-2222-2222-222222222222" },
    accessToken: "t",
    payload: { tenant_id: TENANT, tenant_role: role },
  },
});

async function call(name: string, input: unknown, role = "admin"): Promise<Result> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const parsed = tool.def.inputSchema ? tool.def.inputSchema.parse(input) : input;
  return tool.cb(parsed, ctxFor(role));
}
const textOf = (r: Result) => (r.content ?? []).map((c) => c.text ?? "").join("\n");
const pages = () => db.landing_pages ?? [];
const pageData = (i = 0) => pages()[i].puck_data as PageData;

beforeEach(() => {
  seq = 0;
  plan = "free";
  writes = [];
  db = {
    tenants: [{ id: TENANT, name: "Code Academy", slug: "code-academy", logo_url: "https://cdn.example.com/logo.png", plan: "free", country: "MX" }],
    courses: [
      { course_id: 1, tenant_id: TENANT, title: "Intro to Python", description: "Learn Python", status: "published", deleted_at: null },
      { course_id: 3, tenant_id: TENANT, title: "Old course", description: null, status: "archived", deleted_at: null },
      { course_id: 2, tenant_id: OTHER, title: "Someone else's course", description: null, status: "published", deleted_at: null },
    ],
    products: [
      { product_id: 5, tenant_id: TENANT, name: "Python bundle", description: null, price: 49, currency: "usd", image: null, status: "active", payment_provider: "manual", provider_price_id: null },
      { product_id: 6, tenant_id: OTHER, name: "Foreign bundle", description: null, price: 9, currency: "usd", image: null, status: "active", payment_provider: "manual", provider_price_id: null },
    ],
    product_courses: [{ product_id: 5, course_id: 1, tenant_id: TENANT }],
    plans: [{ plan_id: 7, tenant_id: TENANT, plan_name: "Monthly", description: null, price: 10, currency: "usd", duration_in_days: 30, features: null, deleted_at: null }],
    landing_pages: [],
  };
});

const NEW_TOOLS = [
  "lms_patch_landing_page",
  "lms_list_landing_templates",
  "lms_insert_landing_preset",
  "lms_get_landing_context",
  "lms_list_plans",
];

describe("tool policy (critique F1)", () => {
  it("the new tools are admin-only", () => {
    for (const name of NEW_TOOLS) {
      expect(tools.has(name)).toBe(true);
      expect(isToolAllowedForRole("admin", name)).toBe(true);
      expect(isToolAllowedForRole("teacher", name)).toBe(false);
      expect(isToolAllowedForRole("student", name)).toBe(false);
    }
  });

  it("every landing tool is hidden from teachers and students", () => {
    for (const name of tools.keys()) {
      expect(isToolAllowedForRole("teacher", name)).toBe(false);
      expect(isToolAllowedForRole("student", name)).toBe(false);
    }
  });

  it("a teacher is refused inside the handler too, before any write", async () => {
    const r = await call("lms_create_landing_page", { title: "x", template_id: "course-landing" }, "teacher");
    expect(r.isError).toBe(true);
    expect(writes).toHaveLength(0);
  });
});

describe("guidance (critique F3)", () => {
  it("lms_get_landing_blocks serves the core prompt doc plus the op rules", async () => {
    const r = await call("lms_get_landing_blocks", {});
    const t = textOf(r);
    expect(t).toContain(pageCatalog.promptDoc());
    expect(t).toContain("update_root");
    expect(t).toMatch(/Never invent/);
  });

  it("templates and presets are listed with ids", async () => {
    const r = await call("lms_list_landing_templates", { page_type: "course" });
    const ids = (r.structuredContent!.templates as { id: string }[]).map((t) => t.id);
    expect(ids).toContain("course-landing");
    expect((r.structuredContent!.presets as { id: string }[]).length).toBeGreaterThan(0);
  });

  it("the context lists only this school's bindable ids", async () => {
    const r = await call("lms_get_landing_context", {});
    const sc = r.structuredContent as { courses: { id: number }[]; products: { id: number; course_ids: number[] }[]; plans: { id: number }[] };
    expect(sc.courses.map((c) => c.id)).toEqual([1]);
    expect(sc.products).toEqual([expect.objectContaining({ id: 5, course_ids: [1] })]);
    expect(sc.plans.map((p) => p.id)).toEqual([7]);
    expect(textOf(r)).toContain("not instructions");
  });
});

describe("create from a template → patch → publish", () => {
  it("runs the whole lifecycle", async () => {
    expect(getTemplate("course-landing")).toBeDefined();

    // Create from course-landing with a course binding.
    const created = await call("lms_create_landing_page", {
      title: "Python course",
      slug: "python",
      template_id: "course-landing",
      bindings: { courseId: 1 },
    });
    expect(created.isError).toBeUndefined();
    expect(pages()).toHaveLength(1);
    const page = pageData();
    const hero = page.content.find((b) => b.type === "CourseHero")!;
    expect(hero.props.courseId).toBe("1");
    expect(JSON.stringify(page)).not.toMatch(/\{\{/);
    expect(JSON.stringify(page)).toContain("Code Academy");
    // Server-minted ids, unique.
    const ids = page.content.map((b) => b.props.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /-s\d+$/.test(id))).toBe(true);
    // The preview view comes back with the course name resolved (critique F2).
    expect(created._meta).toMatchObject({ "ui/resourceUri": "ui://views/landing-page-preview.html" });
    const sections = created.structuredContent!.sections as { type: string; heading: string; binding: string | null }[];
    const heroSection = sections.find((s) => s.type === "CourseHero")!;
    expect(heroSection.binding).toBe("Course: Intro to Python");
    expect(heroSection.heading).toBeTruthy();

    // Read it back: outline with ids and updated_at.
    const pageId = String(pages()[0].page_id);
    const got = await call("lms_get_landing_page", { page_id: pageId });
    expect(textOf(got)).toContain(`[${hero.props.id}]`);
    const updatedAt = String(pages()[0].updated_at);
    expect(textOf(got)).toContain(`updated_at: ${updatedAt}`);

    // Patch: add a section after the hero with a temp ref, edit it in the same patch,
    // set SEO, and retitle the hero.
    const patched = await call("lms_patch_landing_page", {
      page_id: pageId,
      expected_updated_at: updatedAt,
      ops: [
        { op: "add", type: "FaqAccordion", after_id: hero.props.id, ref: "faq", props: { title: "Preguntas" } },
        { op: "update", id: "faq", props: { subtitle: "Todo lo que necesitas saber" } },
        { op: "update", id: hero.props.id, props: { titleOverride: "Aprende Python" } },
        { op: "update_root", props: { metaTitle: "Curso de Python" } },
      ],
    });
    expect(patched.isError).toBeUndefined();
    const after = pageData();
    const heroIdx = after.content.findIndex((b) => b.props.id === hero.props.id);
    const faq = after.content[heroIdx + 1];
    expect(faq.type).toBe("FaqAccordion");
    expect(faq.props.id).not.toBe("faq");
    expect(faq.props).toMatchObject({ title: "Preguntas", subtitle: "Todo lo que necesitas saber" });
    // Array defaults filled so the block renders.
    expect(Array.isArray(faq.props.items)).toBe(true);
    expect(after.content[heroIdx].props).toMatchObject({ titleOverride: "Aprende Python", courseId: "1" });
    expect(after.root.props).toMatchObject({ metaTitle: "Curso de Python" });
    expect(textOf(patched)).toContain(`faq → ${faq.props.id}`);
    expect(String(pages()[0].updated_at)).not.toBe(updatedAt);
    // The save was a CAS on updated_at, tenant-filtered.
    const save = writes.filter((w) => w.table === "landing_pages" && w.op === "update").at(-1)!;
    expect(save.filters).toEqual(expect.arrayContaining(["eq:page_id", "eq:tenant_id", "eq:updated_at"]));

    // Publish (no stale "paid plan only" text).
    const pub = await call("lms_publish_landing_page", { page_id: pageId });
    expect(pub.isError).toBeUndefined();
    expect(pages()[0].is_published).toBe(true);
    expect(textOf(pub)).toContain("/p/python");
    expect(textOf(pub)).not.toMatch(/paid plan/);
  });

  it("a product template binds the bundle's courses server-side", async () => {
    plan = "pro";
    const r = await call("lms_create_landing_page", { title: "Bundle", slug: "bundle", template_id: "product-bundle", bindings: { productId: 5 } });
    expect(r.isError).toBeUndefined();
    const page = pageData();
    expect(page.content.find((b) => b.type === "CoursePricingCard")?.props.productId).toBe("5");
    const grid = page.content.find((b) => b.type === "CourseGrid");
    expect(grid?.props.courseIds).toEqual([{ id: "1" }]);
  });

  it("a bundle that includes an archived course still creates its page, without that course", async () => {
    plan = "pro";
    db.product_courses.push({ product_id: 5, course_id: 3, tenant_id: TENANT });
    const r = await call("lms_create_landing_page", { title: "Bundle", slug: "bundle", template_id: "product-bundle", bindings: { productId: 5 } });
    expect(r.isError).toBeUndefined();
    expect(pageData().content.find((b) => b.type === "CourseGrid")?.props.courseIds).toEqual([{ id: "1" }]);
  });
});

describe("zones survive patches", () => {
  function seedNested() {
    const data: PageData = {
      root: { props: {} },
      content: [
        { type: "HeroBlock", props: { id: "hero-1", title: "Hi" } },
        { type: "Section", props: { id: "sec-1" } },
        { type: "CtaBanner", props: { id: "cta-1", heading: "Go" } },
      ],
      zones: { "sec-1:content": [{ type: "TextBlock", props: { id: "txt-1", content: "nested" } }] },
    };
    db.landing_pages.push({
      page_id: "33333333-3333-4333-8333-333333333333",
      tenant_id: TENANT,
      title: "Home",
      slug: "home",
      is_published: false,
      puck_data: data,
      created_at: "2026-10-01T00:00:00+00:00",
      updated_at: "2026-10-01T00:00:00.5+00:00",
    });
    return "33333333-3333-4333-8333-333333333333";
  }

  it("keeps nested blocks when editing others, and can add into a zone", async () => {
    const id = seedNested();
    const r = await call("lms_patch_landing_page", {
      page_id: id,
      ops: [
        { op: "update", id: "cta-1", props: { heading: "Join now" } },
        { op: "add", type: "TextBlock", zone: "sec-1:content", props: { content: "second" } },
        { op: "move", id: "cta-1", after_id: "hero-1" },
      ],
    });
    expect(r.isError).toBeUndefined();
    const d = pageData();
    expect(d.content.map((b) => b.props.id)).toEqual(["hero-1", "cta-1", "sec-1"]);
    expect(d.zones!["sec-1:content"].map((b) => b.props.content)).toEqual(["nested", "second"]);
    expect(d.content[1].props.heading).toBe("Join now");
    expect(findNode(d, "txt-1")?.zone).toBe("sec-1:content");
  });

  it("duplicate re-keys the copy's zones", async () => {
    const id = seedNested();
    const r = await call("lms_patch_landing_page", { page_id: id, ops: [{ op: "duplicate", id: "sec-1", ref: "copy" }] });
    expect(r.isError).toBeUndefined();
    const d = pageData();
    const copy = d.content[2];
    expect(copy.type).toBe("Section");
    expect(copy.props.id).not.toBe("sec-1");
    expect(d.zones![`${copy.props.id}:content`]?.[0]?.props.content).toBe("nested");
    expect(d.zones!["sec-1:content"]).toHaveLength(1);
  });
});

describe("tenant refs (critique C1)", () => {
  it("rejects another school's course id on patch and saves nothing", async () => {
    await call("lms_create_landing_page", { title: "P", slug: "p", template_id: "course-landing", bindings: { courseId: 1 } });
    const before = JSON.stringify(pageData());
    const hero = pageData().content.find((b) => b.type === "CourseHero")!;
    const r = await call("lms_patch_landing_page", {
      page_id: String(pages()[0].page_id),
      ops: [{ op: "update", id: hero.props.id, props: { courseId: 2 } }],
    });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/courseId: 2 is not one of this school's course ids/);
    expect(JSON.stringify(pageData())).toBe(before);
  });

  it("rejects archived courses, foreign products and foreign bindings", async () => {
    let r = await call("lms_create_landing_page", { title: "P", template_id: "course-landing", bindings: { courseId: 2 } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("bindings.courseId");
    r = await call("lms_create_landing_page", {
      title: "P",
      elements: [{ type: "CourseHero", props: { courseId: 3 } }, { type: "ProductGrid", props: { productIds: [5, 6] } }],
    });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/courseId: 3/);
    expect(textOf(r)).toMatch(/productIds: 6/);
    expect(pages()).toHaveLength(0);
  });

  it("refuses unsafe links and unknown block types, all-or-nothing", async () => {
    plan = "pro";
    await call("lms_create_landing_page", { title: "P", slug: "p", elements: [{ type: "HeroBlock", props: { title: "Hi" } }] });
    const before = JSON.stringify(pageData());
    const r = await call("lms_patch_landing_page", {
      page_id: String(pages()[0].page_id),
      ops: [
        { op: "add", type: "CtaBanner", props: { heading: "ok" } },
        { op: "add", type: "HeroBlock", props: { primaryCtaHref: "javascript:alert(1)" } },
        { op: "add", type: "Columns", props: {} },
      ],
    });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/unsafe link/);
    expect(textOf(r)).toMatch(/layout block/);
    expect(JSON.stringify(pageData())).toBe(before);
  });
});

describe("concurrency (critique F4)", () => {
  it("refuses a stale expected_updated_at", async () => {
    await call("lms_create_landing_page", { title: "P", slug: "p", elements: [{ type: "HeroBlock", props: { title: "Hi" } }] });
    const read = String(pages()[0].updated_at);
    // Someone saves in the editor.
    pages()[0].updated_at = "2026-10-08T11:00:00.654321+00:00";
    const before = JSON.stringify(pageData());
    const r = await call("lms_patch_landing_page", {
      page_id: String(pages()[0].page_id),
      expected_updated_at: read,
      ops: [{ op: "update_root", props: { metaTitle: "x" } }],
    });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/changed since you read it/);
    expect(JSON.stringify(pageData())).toBe(before);
  });

  it("sameTimestamp is exact for microsecond values", () => {
    expect(sameTimestamp("2026-10-08T10:00:00.123456+00:00", "2026-10-08T10:00:00.123456+00:00")).toBe(true);
    expect(sameTimestamp("2026-10-08T10:00:00.123Z", "2026-10-08T10:00:00.123+00:00")).toBe(true);
    expect(sameTimestamp("2026-10-08T10:00:00.123456+00:00", "2026-10-08T10:00:00.123Z")).toBe(false);
    expect(sameTimestamp(undefined, "x")).toBe(false);
  });
});

describe("free plan cap (design §6)", () => {
  it("a free school gets one page", async () => {
    let r = await call("lms_create_landing_page", { title: "One", slug: "one", template_id: "school-home" });
    expect(r.isError).toBeUndefined();
    r = await call("lms_create_landing_page", { title: "Two", slug: "two", template_id: "school-home" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/free plan includes 1 landing page/);
    expect(pages()).toHaveLength(1);
  });

  it("a paid school is not capped", async () => {
    plan = "starter";
    await call("lms_create_landing_page", { title: "One", slug: "one", template_id: "school-home" });
    const r = await call("lms_create_landing_page", { title: "Two", slug: "two", template_id: "school-home" });
    expect(r.isError).toBeUndefined();
    expect(pages()).toHaveLength(2);
  });
});

describe("presets", () => {
  it("inserts a course preset after a block with the binding applied", async () => {
    plan = "pro";
    await call("lms_create_landing_page", { title: "P", slug: "p", elements: [{ type: "HeroBlock", props: { title: "Hi" } }, { type: "CtaBanner", props: { heading: "Go" } }] });
    const heroId = pageData().content[0].props.id;
    const r = await call("lms_insert_landing_preset", {
      page_id: String(pages()[0].page_id),
      preset_id: "course-hero-outcomes",
      after_id: heroId,
      bindings: { courseId: 1 },
    });
    expect(r.isError).toBeUndefined();
    expect(pageData().content.map((b) => b.type)).toEqual(["HeroBlock", "CourseHero", "CourseOutcomes", "CtaBanner"]);
    expect(pageData().content[1].props.courseId).toBe("1");
  });

  it("refuses a foreign course binding", async () => {
    plan = "pro";
    await call("lms_create_landing_page", { title: "P", slug: "p", elements: [{ type: "HeroBlock", props: { title: "Hi" } }] });
    const r = await call("lms_insert_landing_preset", { page_id: String(pages()[0].page_id), preset_id: "course-hero-outcomes", bindings: { courseId: 2 } });
    expect(r.isError).toBe(true);
    expect(pageData().content).toHaveLength(1);
  });
});

describe("lms_list_plans", () => {
  it("lists this school's plans for admins only", async () => {
    const r = await call("lms_list_plans", {});
    expect(r.structuredContent).toMatchObject({ count: 1, plans: [{ id: 7, name: "Monthly" }] });
    const t = await call("lms_list_plans", {}, "teacher");
    expect(t.isError).toBe(true);
  });
});

describe("applyAgentOps (pure)", () => {
  const refs = { course: ["1"], product: [], plan: [] };
  const base: PageData = {
    root: { props: {} },
    content: [
      { type: "HeroBlock", props: { id: "a" } },
      { type: "CtaBanner", props: { id: "b" } },
      { type: "FaqAccordion", props: { id: "c" } },
    ],
    zones: {},
  };

  it("moves a block after a later sibling", () => {
    const r = applyAgentOps(base, [{ op: "move", id: "a", after_id: "c" }], { refs });
    expect(r.errors).toEqual([]);
    expect(r.data.content.map((b) => b.props.id)).toEqual(["b", "c", "a"]);
    expect(base.content.map((b) => b.props.id)).toEqual(["a", "b", "c"]);
  });

  it("appends to the root zone by default and reports unknown ids", () => {
    const r = applyAgentOps(base, [{ op: "add", type: "CtaBlock", props: {} }], { refs, idFactory: () => "new-1" });
    expect(r.data.content.at(-1)?.props.id).toBe("new-1");
    expect(r.applied[0]).toMatchObject({ op: "add", zone: ROOT_ZONE, index: 3 });
    const bad = applyAgentOps(base, [{ op: "remove", id: "nope" }], { refs });
    expect(bad.errors[0]).toMatch(/no block with id "nope"/);
  });

  it("fills an added block's defaults in the page's language", () => {
    const add = [{ op: "add" as const, type: "Header", props: { ctaHref: "/pricing" } }];
    const es = applyAgentOps(null, add, { refs, idFactory: () => "h", locale: "es" });
    expect(es.data.content[0].props).toMatchObject({ ctaLabel: "Inscríbete ahora", ctaHref: "/pricing" });
    expect((es.data.content[0].props.navLinks as Array<{ label: string; href: string }>)[0]).toEqual({ label: "Cursos", href: "/courses" });
    const en = applyAgentOps(null, add, { refs, idFactory: () => "h" });
    expect(en.data.content[0].props.ctaLabel).toBe("Enroll Now");
  });
});

describe("preview summaries (critique F2)", () => {
  it("summarises the course blocks from their bindings", () => {
    const lookup = emptyRefLookup();
    lookup.course.set("1", "Intro to Python");
    lookup.product.set("5", "Python bundle");
    const hero = summarizeSection("CourseHero", { courseId: "1" }, lookup);
    expect(hero).toMatchObject({ layout: "hero", heading: "Intro to Python", binding: "Course: Intro to Python" });
    const card = summarizeSection("CoursePricingCard", { courseId: "1", productId: "5" }, lookup);
    expect(card.heading).toBe("Python bundle");
    const grid = summarizeSection("ProductGrid", { productIds: [{ id: "5" }, { id: "9" }] }, lookup);
    expect(grid).toMatchObject({ layout: "grid", items: ["Python bundle", "#9 (not available)"], itemCount: 2 });
    for (const t of ["CourseCurriculum", "CourseOutcomes", "InstructorCard"]) {
      expect(summarizeSection(t, { courseId: "1" }, lookup).binding).toBe("Course: Intro to Python");
    }
    expect(summarizeSection("HeroBlock", { title: "Hi" }, lookup).binding).toBeNull();
  });
});
