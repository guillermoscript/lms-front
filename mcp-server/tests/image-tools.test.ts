/** AI image tools: policy, guardrails, upload path and thumbnail write. */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: unknown };
interface FakeCall { table: string; ops: [string, ...unknown[]][] }

const uploads: { path: string; type: string; size: number }[] = [];
let uploadError: { message: string } | null = null;
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
    for (const m of ["select", "eq", "update"]) {
      chain[m] = (...a: unknown[]) => { call.ops.push([m, ...a]); return chain; };
    }
    chain.single = () => Promise.resolve(next());
    chain.maybeSingle = () => Promise.resolve(next());
    chain.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(next()).then(res, rej);
    return chain;
  };
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: Uint8Array, opts: { contentType: string }) => {
        uploads.push({ path: `${bucket}/${path}`, type: opts.contentType, size: body.byteLength });
        return { error: uploadError };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
    }),
  };
  return { client: { from, storage, rpc: vi.fn(), auth: {} }, calls };
}

vi.mock("../src/supabase.js", () => ({ createUserClient: () => fake.client, getServiceClient: () => null }));
const generateImage = vi.fn();
vi.mock("ai", () => ({ generateImage: (...a: unknown[]) => generateImage(...a) }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => ({ image: (id: string) => ({ id }) }) }));

const { isToolAllowedForRole } = await import("../src/tool-policy.js");
const images = await import("../src/tools/images.js");

type Handler = (input: unknown, ctx: unknown) => Promise<{ isError?: boolean; content?: { text?: string }[]; structuredContent?: Record<string, unknown> }>;
const handlers = new Map<string, Handler>();
images.registerImageTools({
  tool: (def: { name: string }, cb: Handler) => { handlers.set(def.name, cb); return { name: def.name }; },
} as never);

const TENANT = "00000000-0000-0000-0000-000000000001";
const ME = "11111111-1111-1111-1111-111111111111";
const ctxFor = (role: string) => ({
  auth: { user: { id: ME }, accessToken: "t", payload: { tenant_id: TENANT, tenant_role: role } },
});
const text = (r: { content?: { text?: string }[] }) => r.content?.[0]?.text ?? "";
const PROMPT = "A friendly robot teaching a class of plants";

beforeEach(() => {
  uploads.length = 0;
  uploadError = null;
  generateImage.mockReset();
  generateImage.mockResolvedValue({ image: { uint8Array: new Uint8Array(1000) } });
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.MCP_IMAGE_DAILY_CAP;
  images.resetImageQuotaForTests();
  fake = makeFake({ courses: [{ data: { author_id: ME, tenant_id: TENANT } }, { data: null }] });
});
afterEach(() => { delete process.env.OPENAI_API_KEY; });

describe("policy + schema", () => {
  it("teachers and admins only", () => {
    for (const n of ["lms_generate_course_image", "lms_generate_lesson_image"]) {
      expect(isToolAllowedForRole("teacher", n)).toBe(true);
      expect(isToolAllowedForRole("admin", n)).toBe(true);
      expect(isToolAllowedForRole("student", n)).toBe(false);
    }
  });
  it("caps prompt length and defaults set_as_thumbnail", () => {
    const base = { course_id: 1, prompt: PROMPT };
    expect(images.generateCourseImageInput.parse(base).set_as_thumbnail).toBe(true);
    expect(images.generateCourseImageInput.safeParse({ ...base, prompt: "x".repeat(1001) }).success).toBe(false);
    expect(images.generateCourseImageInput.safeParse({ ...base, prompt: "hi" }).success).toBe(false);
    expect(images.generateCourseImageInput.safeParse({ ...base, style: "oil" }).success).toBe(false);
  });
  it("always forbids text in the final prompt", () => {
    expect(images.buildImagePrompt("a cat", "flat")).toMatch(/No text/);
  });
});

describe("lms_generate_course_image", () => {
  const run = (extra: object = {}, role = "teacher") =>
    handlers.get("lms_generate_course_image")!({ course_id: 5, prompt: PROMPT, ...extra }, ctxFor(role));

  it("errors cleanly without OPENAI_API_KEY and does not generate", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await run();
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("OPENAI_API_KEY");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("refuses a course the teacher does not own", async () => {
    fake = makeFake({ courses: [{ data: { author_id: "someone-else", tenant_id: TENANT } }] });
    const r = await run();
    expect(r.isError).toBe(true);
    expect(generateImage).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it("uploads under the tenant prefix as the caller and sets the thumbnail", async () => {
    const r = await run();
    expect(r.isError).toBeUndefined();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toMatch(new RegExp(`^course-images/${TENANT}/courses/5/[0-9a-f-]+\\.webp$`));
    expect(uploads[0].type).toBe("image/webp");
    const url = r.structuredContent?.url as string;
    const upd = fake.calls.filter((c) => c.table === "courses").at(-1)!;
    expect(upd.ops).toContainEqual(["update", { thumbnail_url: url }]);
    expect(upd.ops).toContainEqual(["eq", "tenant_id", TENANT]);
  });

  it("does not touch the course when set_as_thumbnail is false", async () => {
    const r = await run({ set_as_thumbnail: false });
    expect(r.isError).toBeUndefined();
    expect(fake.calls.some((c) => c.ops.some((o) => o[0] === "update"))).toBe(false);
  });

  it("rejects oversized output and upload failures", async () => {
    generateImage.mockResolvedValue({ image: { uint8Array: new Uint8Array(images.MAX_IMAGE_BYTES + 1) } });
    expect(text(await run())).toContain("larger than 5MB");
    expect(uploads).toHaveLength(0);
  });

  it("surfaces provider failures and refunds the quota slot", async () => {
    generateImage.mockRejectedValueOnce(new Error("boom"));
    const r = await run();
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("boom");
    fake = makeFake({ courses: [{ data: { author_id: ME, tenant_id: TENANT } }, { data: null }] });
    expect((await run()).isError).toBeUndefined();
  });
});

describe("quota", () => {
  it("enforces cooldown and daily cap per user", () => {
    process.env.MCP_IMAGE_DAILY_CAP = "2";
    const t0 = Date.parse("2026-10-06T10:00:00Z");
    expect(images.reserveImageQuota("u", t0)).toBeNull();
    expect(images.reserveImageQuota("u", t0 + 1000)).toMatch(/Wait/);
    expect(images.reserveImageQuota("u", t0 + 10_000)).toBeNull();
    expect(images.reserveImageQuota("u", t0 + 20_000)).toMatch(/Daily AI image limit/);
    expect(images.reserveImageQuota("other", t0 + 20_000)).toBeNull();
    expect(images.reserveImageQuota("u", t0 + 86_400_000)).toBeNull();
  });
});

describe("lms_generate_lesson_image", () => {
  it("verifies lesson ownership and returns markdown", async () => {
    fake = makeFake({
      lessons: [{ data: { course_id: 5 } }],
      courses: [{ data: { author_id: ME, tenant_id: TENANT } }],
    });
    const r = await handlers.get("lms_generate_lesson_image")!({ lesson_id: 9, prompt: PROMPT }, ctxFor("teacher"));
    expect(r.isError).toBeUndefined();
    expect(uploads[0].path).toContain(`${TENANT}/courses/5/lessons/9/`);
    expect(r.structuredContent?.markdown).toMatch(/^!\[.+\]\(https:\/\/cdn\.test\//);
    expect(fake.calls.some((c) => c.ops.some((o) => o[0] === "update"))).toBe(false);
  });
});
