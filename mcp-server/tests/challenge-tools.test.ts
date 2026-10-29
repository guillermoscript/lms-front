/**
 * Challenge tools (#1043): role gating, the request each write tool forwards to
 * the app route (the rules themselves are tested next to the shared core in
 * tests/unit/challenge-links-core.test.ts), error mapping, and the ranking read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let rpcResult: { data?: unknown; error?: { message: string } | null } = {};
const rpc = vi.fn(async () => ({ data: rpcResult.data ?? null, error: rpcResult.error ?? null }));

vi.mock("../src/supabase.js", () => ({
  createUserClient: () => ({ rpc }),
  getServiceClient: () => null,
}));

const { isToolAllowedForRole } = await import("../src/tool-policy.js");
const challenges = await import("../src/tools/challenges.js");

type Handler = (input: unknown, ctx: unknown) => Promise<{
  isError?: boolean;
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
}>;

const handlers = new Map<string, Handler>();
challenges.registerChallengeTools({
  tool: (def: { name: string }, cb: Handler) => {
    handlers.set(def.name, cb);
    return { name: def.name };
  },
} as never);

const ctxFor = (role = "teacher") => ({
  auth: { user: { id: "me" }, accessToken: "jwt-token", payload: { tenant_id: "t1", tenant_role: role } },
});
const textOf = (r: { content?: { text?: string }[] }) => r.content?.[0]?.text ?? "";

const fetchMock = vi.fn();
function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

beforeEach(() => {
  process.env.LMS_APP_URL = "https://app.example.test/";
  fetchMock.mockReset();
  rpc.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LMS_APP_URL;
});

describe("registration and role policy", () => {
  it("registers the four tools", () => {
    expect([...handlers.keys()].sort()).toEqual([
      "lms_create_challenge_link",
      "lms_deactivate_challenge_link",
      "lms_get_challenge_ranking",
      "lms_set_exercise_challengeable",
    ]);
  });

  it("students may share/read/deactivate but never mark exercises; staff may do all", () => {
    for (const n of ["lms_create_challenge_link", "lms_get_challenge_ranking", "lms_deactivate_challenge_link"]) {
      expect(isToolAllowedForRole("student", n)).toBe(true);
    }
    expect(isToolAllowedForRole("student", "lms_set_exercise_challengeable")).toBe(false);
    for (const role of ["teacher", "admin"]) {
      for (const n of handlers.keys()) expect(isToolAllowedForRole(role, n)).toBe(true);
    }
    expect(isToolAllowedForRole(undefined, "lms_create_challenge_link")).toBe(false);
  });
});

describe("lms_set_exercise_challengeable", () => {
  it("forwards the caller's own token and returns the state plus the public warning", async () => {
    respond(200, { exerciseId: 5, isChallengeable: true, warning: "publicly readable" });
    const r = await handlers.get("lms_set_exercise_challengeable")!({ exercise_id: 5, enabled: true }, ctxFor());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.example.test/api/challenges/manage");
    expect(init.headers.Authorization).toBe("Bearer jwt-token");
    expect(sent()).toEqual({ action: "set_challengeable", exerciseId: 5, enabled: true });
    expect(r.structuredContent).toEqual({ exercise_id: 5, is_challengeable: true, warning: "publicly readable" });
    expect(textOf(r)).toContain("publicly readable");
  });

  it.each([
    ["Unauthorized", 403],
    ["Only essay and discussion exercises can be challenges", 422],
    ["Challenges are not enabled for this school", 422],
  ])("surfaces a refusal: %s", async (error, status) => {
    respond(status, { error });
    const r = await handlers.get("lms_set_exercise_challengeable")!({ exercise_id: 5, enabled: true }, ctxFor());
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(error);
  });
});

describe("lms_create_challenge_link", () => {
  const create = handlers.get("lms_create_challenge_link")!;

  it("open link by default: url + token, no score", async () => {
    respond(200, { url: "https://school.example.test/reto/abc123def456", token: "abc123def456", withScore: false, score: null });
    const r = await create({ exercise_id: 5 }, ctxFor());
    expect(sent()).toMatchObject({ action: "create_link", exerciseId: 5, useBestAttempt: false });
    expect(r.structuredContent).toEqual({ url: "https://school.example.test/reto/abc123def456", token: "abc123def456", with_score: false });
    expect(textOf(r)).toContain("https://school.example.test/reto/abc123def456");
    expect(textOf(r)).toContain("Open link");
  });

  it("use_best_attempt returns the score; a fallback says so", async () => {
    respond(200, { url: "u", token: "t", withScore: true, score: 87 });
    const withScore = await create({ exercise_id: 5, use_best_attempt: true }, ctxFor());
    expect(sent().useBestAttempt).toBe(true);
    expect(withScore.structuredContent).toMatchObject({ with_score: true, score: 87 });

    fetchMock.mockClear();
    respond(200, { url: "u", token: "t", withScore: false, score: null, fellBackToOpen: true });
    const open = await create({ exercise_id: 5, use_best_attempt: true }, ctxFor());
    expect(textOf(open)).toContain("no official attempt");
  });

  it("notes a reused link and maps refusals to errors", async () => {
    respond(200, { url: "u", token: "t", withScore: false, reused: true });
    expect(textOf(await create({ exercise_id: 5 }, ctxFor()))).toContain("reused");
    respond(422, { error: "Exercise is not challengeable" });
    const r = await create({ exercise_id: 5 }, ctxFor("student"));
    expect(r.isError).toBe(true);
  });

  it("needs an exercise or an attempt, and never calls the app without one", async () => {
    const r = await create({}, ctxFor());
    expect(r.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("lms_deactivate_challenge_link", () => {
  it("sends the token and confirms; a non-owner refusal is an error", async () => {
    const deactivate = handlers.get("lms_deactivate_challenge_link")!;
    respond(200, { deactivated: true });
    const r = await deactivate({ token: "abc123def456" }, ctxFor());
    expect(sent()).toEqual({ action: "deactivate_link", token: "abc123def456" });
    expect(r.isError).toBeUndefined();
    respond(403, { error: "Unauthorized" });
    expect((await deactivate({ token: "abc123def456" }, ctxFor("student"))).isError).toBe(true);
  });
});

describe("transport failures", () => {
  it("unreachable app, rejected session and a missing app origin are clean errors", async () => {
    const create = handlers.get("lms_create_challenge_link")!;
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(textOf(await create({ exercise_id: 5 }, ctxFor()))).toContain("Could not reach");
    respond(401, { error: "Unauthorized" });
    expect(textOf(await create({ exercise_id: 5 }, ctxFor()))).toContain("Reconnect");
    delete process.env.LMS_APP_URL;
    delete process.env.LMS_PLATFORM_DOMAIN;
    delete process.env.NEXT_PUBLIC_PLATFORM_DOMAIN;
    delete process.env.MCP_URL;
    delete process.env.MCP_SERVER_URL;
    expect((await create({ exercise_id: 5 }, ctxFor())).isError).toBe(true);
  });
});

describe("lms_get_challenge_ranking", () => {
  const ranking = () => handlers.get("lms_get_challenge_ranking")!;

  it("reads the member-only RPC as the caller and exposes no ids or emails", async () => {
    rpcResult = {
      data: [
        { rank: "1", user_id: "u1", display_name: "Ana L.", score: 92, passed: true, created_at: "2026-10-01" },
        { rank: 2, user_id: "u2", display_name: "", score: 70, passed: false, created_at: "2026-10-02" },
      ],
    };
    const r = await ranking()({ exercise_id: 5 }, ctxFor("student"));
    expect(rpc).toHaveBeenCalledWith("get_challenge_ranking", { _exercise_id: 5 });
    expect(r.structuredContent).toEqual({
      exercise_id: 5,
      total: 2,
      ranking: [
        { rank: 1, name: "Ana L.", score: 92, passed: true, played_at: "2026-10-01" },
        { rank: 2, name: "Anonymous", score: 70, passed: false, played_at: "2026-10-02" },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("u1");
  });

  it("empty ranking and RPC errors (non-member, other tenant) are handled", async () => {
    rpcResult = { data: [] };
    expect(textOf(await ranking()({ exercise_id: 5 }, ctxFor()))).toContain("No one is ranked");
    rpcResult = { error: { message: "not a member" } };
    expect((await ranking()({ exercise_id: 5 }, ctxFor())).isError).toBe(true);
  });
});
