/** AI image tools: policy, internal-endpoint call (BYOK, no key here), upload path and thumbnail write. */
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
const appFetch = vi.fn();

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
const appImage = (bytes: number, mediaType = "image/webp") =>
  new Response(
    JSON.stringify({ image: Buffer.alloc(bytes, 1).toString("base64"), mediaType, provider: "openai", model: "gpt-image-1" }),
    { status: 200 }
  );
const appError = (status: number, code: string, extra: object = {}) =>
  new Response(JSON.stringify({ error: { code, ...extra } }), { status });
const PROMPT = "A friendly robot teaching a class of plants";

beforeEach(() => {
  uploads.length = 0;
  uploadError = null;
  appFetch.mockReset();
  appFetch.mockResolvedValue(appImage(1000));
  vi.stubGlobal("fetch", appFetch);
  process.env.MCP_PROXY_SECRET = "shared-secret";
  process.env.LMS_APP_URL = "https://app.example.com";
  fake = makeFake({ courses: [{ data: { author_id: ME, tenant_id: TENANT } }, { data: null }] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MCP_PROXY_SECRET;
  delete process.env.LMS_APP_URL;
});

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

  it("calls the internal app route with the caller token + shared secret, never a provider key", async () => {
    const r = await run({ style: "flat" });
    expect(r.isError).toBeUndefined();
    expect(appFetch).toHaveBeenCalledTimes(1);
    const [url, init] = appFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://app.example.com/api/internal/ai/image");
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(init.headers["X-MCP-Secret"]).toBe("shared-secret");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body)).toEqual(["prompt"]);
    expect(body.prompt).toMatch(/No text/);
  });

  it("says 'not configured' (no call, no upload) without MCP_PROXY_SECRET or an app address", async () => {
    delete process.env.MCP_PROXY_SECRET;
    let r = await run();
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("not set up for this school");
    delete process.env.LMS_APP_URL;
    process.env.MCP_PROXY_SECRET = "x";
    fake = makeFake({ courses: [{ data: { author_id: ME, tenant_id: TENANT } }, { data: null }] });
    r = await run();
    expect(r.isError).toBe(true);
    expect(appFetch).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it("maps the school's missing key (402) to a clear admin-facing message", async () => {
    appFetch.mockResolvedValue(appError(402, "ai_not_configured", { feature: "image_generation" }));
    const r = await run();
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Settings > AI");
    expect(uploads).toHaveLength(0);
  });

  it("maps invalid key, quota and rate limits without echoing provider detail", async () => {
    const cases: [Response, string][] = [
      [appError(424, "ai_key_invalid"), "rejected"],
      [appError(429, "image_rate_limited", { reason: "cooldown" }), "Wait a few seconds"],
      [appError(429, "image_rate_limited", { reason: "daily_limit" }), "Daily AI image limit"],
      [appError(500, "weird"), "HTTP 500"],
    ];
    for (const [res, expected] of cases) {
      fake = makeFake({ courses: [{ data: { author_id: ME, tenant_id: TENANT } }, { data: null }] });
      appFetch.mockResolvedValueOnce(res);
      expect(text(await run())).toContain(expected);
    }
  });

  it("refuses a course the teacher does not own", async () => {
    fake = makeFake({ courses: [{ data: { author_id: "someone-else", tenant_id: TENANT } }] });
    const r = await run();
    expect(r.isError).toBe(true);
    expect(appFetch).not.toHaveBeenCalled();
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

  it("rejects oversized output and unsupported media types", async () => {
    appFetch.mockResolvedValueOnce(appImage(images.MAX_IMAGE_BYTES + 1));
    expect(text(await run())).toContain("larger than 5MB");
    fake = makeFake({ courses: [{ data: { author_id: ME, tenant_id: TENANT } }, { data: null }] });
    appFetch.mockResolvedValueOnce(appImage(10, "image/svg+xml"));
    expect((await run()).isError).toBe(true);
    expect(uploads).toHaveLength(0);
  });

  it("uses the returned media type for the extension", async () => {
    appFetch.mockResolvedValueOnce(appImage(100, "image/png"));
    await run();
    expect(uploads[0].path).toMatch(/\.png$/);
    expect(uploads[0].type).toBe("image/png");
  });

  it("reports network failure cleanly", async () => {
    appFetch.mockRejectedValueOnce(new Error("ECONNREFUSED sk-secret"));
    const r = await run();
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Could not reach");
    expect(text(r)).not.toContain("sk-secret");
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
