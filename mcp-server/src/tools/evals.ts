import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { ok, okText, errorResult } from "../format.js";
import { getAppOrigin } from "../env.js";

/**
 * AI task tests (docs/plans/AI_EVALS_AND_SCENARIOS.md §7).
 *
 * Evals + simulated-student scenarios for a lesson's AI task. This server never
 * calls an LLM: every tool is a thin wrapper over the app's
 * `/api/teacher/evals/*` routes, called with the caller's own access token
 * (same pattern as the platform grader in practice.ts / exam-taking.ts). The
 * app runs the model calls on the school's own AI key (BYOK) and enforces
 * staff/ownership rules again.
 */

const EVAL_TIMEOUT_MS = 60_000;
const RUN_START_TIMEOUT_MS = 30_000;

// ── HTTP helper ──────────────────────────────────────────────────────────────

export interface EvalHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export async function evalRequest(
  appOrigin: string,
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  payload?: unknown,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<EvalHttpResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${appOrigin}/api/teacher/evals${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? EVAL_TIMEOUT_MS),
  });
  let body: Record<string, unknown> = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // 204 / non-JSON body.
  }
  return { status: res.status, body };
}

/** Turn a non-2xx response into advice an AI agent can act on. */
export function describeEvalError(status: number, body: Record<string, unknown>): string {
  const err = body.error;
  const code =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : null;

  switch (code) {
    case "no_cases":
      return "This lesson has no test cases yet. Save a golden chat with lms_create_eval_case (kind 'golden_chat') or generate simulated-student scenarios with lms_generate_eval_scenarios first, then run again.";
    case "no_task":
      return "This lesson has no AI task yet. Create one with lms_upsert_lesson_ai_task before creating cases or running tests.";
    case "run_in_progress":
      return "A test run is already in progress for this lesson (one at a time). Wait for it to finish — check it with lms_list_eval_runs / lms_get_eval_run — then start another.";
    case "run_limit":
      return `Daily test-run limit reached for this school${typeof body.limit === "number" ? ` (${body.limit} per 24 h)` : ""}. Try again tomorrow.`;
    case "case_limit":
      return `This lesson already has the maximum number of test cases${typeof body.limit === "number" ? ` (${body.limit})` : ""}. Delete or merge some (an admin can use lms_delete_eval_case) before adding more.`;
    default:
  }
  if (err && typeof err === "object" && code) {
    // Typed AI setup/provider failure from the BYOK layer.
    return `The school's AI is not available for this action (${code}). An admin must configure the school's AI provider key in the dashboard (Settings > AI) before tests can run.`;
  }
  if (status === 401) return "The LMS app rejected your access token (HTTP 401). Reconnect the MCP server and make sure your school is selected.";
  if (status === 403) return "You are not allowed to manage tests for this lesson (HTTP 403). Teachers can only test lessons in their own courses.";
  if (status === 404) return "Not found (HTTP 404): the lesson, case or run does not exist in your school.";
  if (status === 400) {
    const issues = Array.isArray(body.issues)
      ? (body.issues as { path?: unknown[]; message?: string }[])
          .map((i) => `${(i.path ?? []).join(".")}: ${i.message ?? "invalid"}`)
          .join("; ")
      : "";
    return `The app rejected the request as invalid${issues ? ` (${issues})` : typeof err === "string" ? ` (${err})` : ""}.`;
  }
  return `The LMS app returned HTTP ${status}${typeof err === "string" ? `: ${err}` : ""}.`;
}

// ── Pure builders / formatters (exported for tests) ──────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]).describe("'user' = the student, 'assistant' = the AI tutor"),
  text: z.string().min(1).max(4000).describe("Message text (max 4000 chars)"),
});

export interface CreateCaseArgs {
  kind: "golden_chat" | "scenario";
  name: string;
  importance_note?: string;
  expected_completed?: boolean | null;
  must_keep?: string[];
  messages?: { role: "user" | "assistant"; text: string }[];
  completed?: boolean;
  completed_turn?: number | null;
  persona?: string;
  goal?: string;
  script?: string[];
  max_turns?: number;
}

/** Validate that the fields for `kind` exist and build the POST body. */
export function buildCreateCaseBody(
  a: CreateCaseArgs
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const common = {
    name: a.name,
    ...(a.importance_note !== undefined ? { importance_note: a.importance_note } : {}),
    expected: { completed: a.expected_completed ?? null },
    must_keep: a.must_keep ?? [],
  };
  if (a.kind === "golden_chat") {
    if (!a.messages || a.messages.length === 0)
      return { ok: false, error: "A golden_chat case needs `messages` (the saved student/tutor conversation, max 40 messages)." };
    if (a.persona || a.goal || a.script || a.max_turns !== undefined)
      return { ok: false, error: "persona/goal/script/max_turns belong to kind 'scenario', not 'golden_chat'." };
    return {
      ok: true,
      body: {
        kind: "golden_chat",
        source: "teacher",
        ...common,
        input: { messages: a.messages },
        ...(a.completed !== undefined
          ? {
              golden_output: {
                completed: a.completed,
                completed_turn: a.completed ? (a.completed_turn ?? null) : null,
              },
            }
          : {}),
      },
    };
  }
  if (!a.persona)
    return { ok: false, error: "A scenario case needs `persona` (who the simulated student is, e.g. 'impatient beginner who gives one-word answers')." };
  if (a.messages || a.completed !== undefined || a.completed_turn !== undefined)
    return { ok: false, error: "messages/completed/completed_turn belong to kind 'golden_chat', not 'scenario'." };
  return {
    ok: true,
    body: {
      kind: "scenario",
      ...common,
      input: {
        persona: a.persona,
        goal: a.goal ?? "",
        script: a.script ?? [],
        max_turns: a.max_turns ?? 8,
      },
    },
  };
}

interface CaseRow {
  id: string;
  kind: string;
  source?: string;
  name: string;
  importance_note?: string | null;
  expected?: { completed?: boolean | null } | null;
  must_keep?: string[] | null;
  input?: Record<string, unknown> | null;
  teacher_edited?: boolean;
}

function expectedLabel(v: boolean | null | undefined): string {
  return v === true ? "should complete" : v === false ? "should NOT complete" : "either outcome ok";
}

export function formatCase(c: CaseRow): string {
  const lines = [
    `- **${c.name}** (id \`${c.id}\`, ${c.kind === "scenario" ? "simulated student" : "golden chat"}${c.source && c.source !== "teacher" ? `, ${c.source}` : ""}${c.teacher_edited ? ", edited" : ""}) — ${expectedLabel(c.expected?.completed)}`,
  ];
  if (c.importance_note) lines.push(`  - why it matters: ${c.importance_note}`);
  if (c.must_keep?.length) lines.push(`  - must keep: ${c.must_keep.map((m) => `"${m}"`).join("; ")}`);
  const input = c.input ?? {};
  if (c.kind === "scenario") {
    lines.push(`  - persona: ${String(input.persona ?? "")}`);
    if (input.goal) lines.push(`  - goal: ${String(input.goal)}`);
    const script = Array.isArray(input.script) ? input.script : [];
    if (script.length) lines.push(`  - scripted opening: ${script.map((s) => `"${String(s)}"`).join(" → ")}`);
    lines.push(`  - max turns: ${String(input.max_turns ?? 8)}`);
  } else {
    const msgs = Array.isArray(input.messages) ? input.messages : [];
    lines.push(`  - ${msgs.length} saved messages`);
  }
  return lines.join("\n");
}

interface Verdict { criterion: string; passed: boolean; evidence?: string }
interface ResultRow {
  case_name: string;
  case_kind: string;
  completed: boolean | null;
  completed_turn: number | null;
  expected?: { completed?: boolean | null } | null;
  deviation: unknown;
  passed: boolean | null;
  error: string | null;
  verdicts?: Verdict[] | null;
  transcript?: { role: string; text: string }[] | null;
}

function versionNo(row: { ai_config_versions?: unknown }): string {
  const v = row.ai_config_versions;
  const one = Array.isArray(v) ? v[0] : v;
  const n = one && typeof one === "object" ? (one as { version_no?: unknown }).version_no : undefined;
  return typeof n === "number" ? `v${n}` : "unknown version";
}

function summaryLine(summary: unknown): string {
  if (!summary || typeof summary !== "object") return "";
  const s = summary as Record<string, unknown>;
  const parts = Object.entries(s)
    .filter(([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`);
  return parts.join(", ");
}

function deviationText(d: unknown): string {
  if (d == null || d === "") return "";
  return typeof d === "string" ? d : JSON.stringify(d);
}

export function formatRunReport(
  runId: string,
  run: Record<string, unknown>,
  results: ResultRow[],
  includeTranscripts: boolean
): string {
  const status = String(run.status ?? "unknown");
  const out: string[] = [`# Test run ${runId}`, ""];
  out.push(`- **Status:** ${status}`);
  out.push(`- **Task version:** ${versionNo(run)}`);
  const sum = summaryLine(run.summary);
  if (sum) out.push(`- **Summary:** ${sum}`);
  // model_ids is { tutor, verifier, simulator, judge } as "provider/model".
  if (run.model_ids && typeof run.model_ids === "object") {
    const models = Object.entries(run.model_ids as Record<string, unknown>).map(([role, id]) => `${role} ${String(id)}`);
    if (models.length) out.push(`- **Models:** ${models.join(", ")}`);
  }
  if (typeof run.error === "string" && run.error) out.push(`- **Run error:** ${run.error}`);
  out.push("");

  if (status === "queued" || status === "running") {
    out.push(`Still ${status === "queued" ? "queued" : "running"}${results.length ? ` (${results.length} case result(s) so far)` : ""}. Call lms_get_eval_run again in about a minute.`);
    if (!results.length) return out.join("\n");
    out.push("");
  }

  if (results.length === 0) {
    out.push("No case results.");
    return out.join("\n");
  }

  const passedCount = results.filter((r) => r.passed === true).length;
  out.push(`## Cases (${passedCount}/${results.length} passed)`, "");
  for (const r of results) {
    const mark = r.error ? "!" : r.passed ? "✓" : "✗";
    const outcome = r.completed == null ? "n/a" : r.completed ? `completed${r.completed_turn != null ? ` at turn ${r.completed_turn}` : ""}` : "did not complete";
    const dev = deviationText(r.deviation);
    const expected = r.expected?.completed == null ? "" : ` (expected: ${expectedLabel(r.expected.completed)})`;
    out.push(
      `${mark} **${r.case_name}** (${r.case_kind === "scenario" ? "simulated student" : "golden chat"}) — ${outcome}${expected}${dev ? ` — deviation: ${dev}/100` : ""}${r.error ? ` — error: ${r.error}` : ""}`
    );
  }

  const failing = results.filter((r) => (r.verdicts ?? []).some((v) => !v.passed));
  if (failing.length) {
    out.push("", "## Failed criteria", "");
    for (const r of failing) {
      out.push(`**${r.case_name}**`);
      for (const v of (r.verdicts ?? []).filter((x) => !x.passed)) {
        out.push(`- ✗ ${v.criterion}${v.evidence ? ` — evidence: ${v.evidence}` : ""}`);
      }
    }
  }

  if (includeTranscripts) {
    out.push("", "## Transcripts", "");
    for (const r of results) {
      out.push(`### ${r.case_name}`);
      const t = r.transcript ?? [];
      if (!t.length) out.push("(no transcript)");
      for (const m of t) out.push(`- **${m.role === "user" ? "Student" : "Tutor"}:** ${m.text}`);
      out.push("");
    }
  } else {
    out.push("", "_Transcripts omitted — call again with include_transcripts: true to read the conversations._");
  }
  if (status === "completed" || status === "succeeded" || status === "finished" || status === "done") {
    out.push("", "Next: if cases failed, adjust the task with lms_upsert_lesson_ai_task, then lms_run_evals again and compare with lms_list_eval_runs / lms_get_task_version_metrics.");
  }
  return out.join("\n");
}

// ── Registration ─────────────────────────────────────────────────────────────

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;

const WORKFLOW =
  "Workflow: create/edit the task (lms_upsert_lesson_ai_task) → save golden chats (lms_create_eval_case) or generate simulated students (lms_generate_eval_scenarios) → lms_run_evals → read lms_get_eval_run → fix the prompt → run again → compare runs.";

const ScenarioFields = {
  persona: z.string().min(1).max(1000).optional().describe("Scenario only: who the simulated student is (e.g. 'anxious beginner who gives short answers')"),
  goal: z.string().max(1000).optional().describe("Scenario only: what this student is trying to do or what the test should probe"),
  script: z.array(z.string().min(1).max(4000)).max(5).optional().describe("Scenario only: fixed first student messages (max 5) sent before the simulator takes over"),
  max_turns: z.number().int().min(1).max(10).optional().describe("Scenario only: max student turns (1-10, default 8)"),
};

export function registerEvalTools(server: LmsServer) {
  /**
   * Shared handler plumbing: session, app origin, optional lesson ownership
   * pre-check, then `fn`. Never throws.
   */
  async function run(
    ctx: unknown,
    lessonId: number | null,
    fn: (call: (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, payload?: unknown, timeoutMs?: number) => Promise<EvalHttpResult>, session: LmsSession) => Promise<ReturnType<typeof ok> | ReturnType<typeof okText> | ReturnType<typeof errorResult>>
  ) {
    let session: LmsSession;
    try {
      session = LmsSession.fromContext(ctx);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
    try {
      if (lessonId !== null) await session.verifyLessonOwnership(lessonId);
      const origin = getAppOrigin();
      if (!origin)
        return errorResult("This MCP server has no LMS app address (set LMS_APP_URL), so it cannot reach the test runner. Use the lesson's AI task Tests tab in the LMS app.");
      const token = session.getAccessToken();
      return await fn(
        (method, path, payload, timeoutMs) => evalRequest(origin, token, method, path, payload, { timeoutMs }),
        session
      );
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError")
        return errorResult("The LMS app did not answer in time. Try again in a moment.");
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  }

  // ── lms_list_eval_cases ────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_eval_cases",
      description: `List the test cases of a lesson's AI task: golden chats (saved conversations replayed against the current prompt) and scenarios (simulated students), plus whether scenarios auto-regenerate when the task changes. ${WORKFLOW}`,
      schema: z.object({ lesson_id: z.number().describe("The lesson ID") }),
      annotations: READ_ONLY,
    },
    async ({ lesson_id }, ctx) =>
      run(ctx, lesson_id, async (call) => {
        const res = await call("GET", `/lesson-task/${lesson_id}/cases`);
        if (res.status !== 200) return errorResult(describeEvalError(res.status, res.body));
        const cases = (Array.isArray(res.body.cases) ? res.body.cases : []) as CaseRow[];
        const suite = res.body.suite as { auto_regenerate?: boolean } | undefined;
        const md = cases.length
          ? cases.map(formatCase).join("\n")
          : "No test cases yet. Create a golden with lms_create_eval_case or call lms_generate_eval_scenarios.";
        return ok(
          { lesson_id, cases, suite: suite ?? { auto_regenerate: true } },
          `# Test cases for lesson ${lesson_id} (${cases.length})\n\nScenarios auto-regenerate on task changes: ${suite?.auto_regenerate === false ? "no" : "yes"}\n\n${md}`
        );
      })
  );

  // ── lms_create_eval_case ───────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_eval_case",
      description: `Add a test case to a lesson's AI task. kind 'golden_chat': a conversation (messages) that must keep working after you change the prompt — optionally record whether it completed (completed/completed_turn). kind 'scenario': a simulated student (persona, goal, optional scripted first messages, max_turns) played by the platform. Both can set expected_completed (true = the task must complete, false = must NOT complete, omit/null = either) and must_keep (short criteria a judge checks, e.g. 'Tutor never gives the final answer'; max 8). Max 20 cases per lesson. ${WORKFLOW}`,
      schema: z.object({
        lesson_id: z.number().describe("The lesson ID"),
        kind: z.enum(["golden_chat", "scenario"]).describe("'golden_chat' needs messages; 'scenario' needs persona"),
        name: z.string().min(1).max(200).describe("Short case name"),
        importance_note: z.string().max(2000).optional().describe("Why this case matters (shown in reports)"),
        expected_completed: z.boolean().nullable().optional().describe("true = student must complete the task, false = must not, null/omitted = either is fine"),
        must_keep: z.array(z.string().min(1).max(300)).max(8).optional().describe("Criteria the judge verifies on this conversation (max 8)"),
        messages: z.array(messageSchema).min(1).max(40).optional().describe("golden_chat only: the conversation, in order (max 40)"),
        completed: z.boolean().optional().describe("golden_chat only: did this conversation complete the task? (recorded as the golden outcome)"),
        completed_turn: z.number().int().min(1).max(100).nullable().optional().describe("golden_chat only: which student turn completed it"),
        ...ScenarioFields,
      }),
      annotations: WRITE,
    },
    async (input, ctx) => {
      const built = buildCreateCaseBody(input);
      if (!built.ok) return errorResult(built.error);
      return run(ctx, input.lesson_id, async (call) => {
        const res = await call("POST", `/lesson-task/${input.lesson_id}/cases`, built.body);
        if (res.status !== 201) return errorResult(describeEvalError(res.status, res.body));
        const c = res.body.case as CaseRow;
        return ok({ case: c }, `Saved test case:\n\n${formatCase(c)}\n\nAdd more cases, or call lms_run_evals to test the current prompt.`);
      });
    }
  );

  // ── lms_update_eval_case ───────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_update_eval_case",
      description:
        "Edit a test case: name, importance_note, expected_completed, must_keep, and — for scenarios — persona/goal/script/max_turns. Golden transcripts never change (delete and re-create instead). Editing a generated scenario marks it teacher-edited so it is no longer replaced when scenarios regenerate. When changing scenario fields, pass lesson_id so unspecified scenario fields keep their current value.",
      schema: z.object({
        case_id: z.string().describe("The case ID (uuid from lms_list_eval_cases)"),
        lesson_id: z.number().optional().describe("Required when editing scenario fields (persona/goal/script/max_turns): used to merge with the current scenario"),
        name: z.string().min(1).max(200).optional(),
        importance_note: z.string().max(2000).nullable().optional(),
        expected_completed: z.boolean().nullable().optional().describe("true / false / null (either)"),
        must_keep: z.array(z.string().min(1).max(300)).max(8).optional().describe("Replaces the whole list"),
        ...ScenarioFields,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input, ctx) => {
      const scenarioEdit =
        input.persona !== undefined || input.goal !== undefined || input.script !== undefined || input.max_turns !== undefined;
      if (scenarioEdit && input.lesson_id === undefined)
        return errorResult("Pass lesson_id when editing scenario fields (persona/goal/script/max_turns) so they can be merged with the current scenario.");
      return run(ctx, input.lesson_id ?? null, async (call) => {
        const patch: Record<string, unknown> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.importance_note !== undefined) patch.importance_note = input.importance_note;
        if (input.expected_completed !== undefined) patch.expected = { completed: input.expected_completed };
        if (input.must_keep !== undefined) patch.must_keep = input.must_keep;
        if (scenarioEdit) {
          const list = await call("GET", `/lesson-task/${input.lesson_id}/cases`);
          if (list.status !== 200) return errorResult(describeEvalError(list.status, list.body));
          const existing = (list.body.cases as CaseRow[] | undefined)?.find((c) => c.id === input.case_id);
          if (!existing) return errorResult(`Case ${input.case_id} was not found on lesson ${input.lesson_id}.`);
          if (existing.kind !== "scenario")
            return errorResult("persona/goal/script/max_turns can only be edited on scenario cases; golden transcripts never change.");
          const cur = existing.input ?? {};
          patch.scenario = {
            persona: input.persona ?? cur.persona,
            goal: input.goal ?? cur.goal ?? "",
            script: input.script ?? cur.script ?? [],
            max_turns: input.max_turns ?? cur.max_turns ?? 8,
          };
        }
        if (Object.keys(patch).length === 0) return errorResult("Nothing to update: pass at least one field to change.");
        const res = await call("PATCH", `/cases/${encodeURIComponent(input.case_id)}`, patch);
        if (res.status !== 200) return errorResult(describeEvalError(res.status, res.body));
        const c = res.body.case as CaseRow;
        return ok({ case: c }, `Updated test case:\n\n${formatCase(c)}`);
      });
    }
  );

  // ── lms_delete_eval_case ───────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_delete_eval_case",
      description: "Permanently delete a test case. Past run reports keep their results. Admin only.",
      schema: z.object({ case_id: z.string().describe("The case ID (uuid from lms_list_eval_cases)") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ case_id }, ctx) =>
      run(ctx, null, async (call) => {
        const res = await call("DELETE", `/cases/${encodeURIComponent(case_id)}`);
        if (res.status !== 204 && res.status !== 200) return errorResult(describeEvalError(res.status, res.body));
        return ok({ success: true, deleted_case_id: case_id }, `Deleted test case ${case_id}.`);
      })
  );

  // ── lms_generate_eval_scenarios ────────────────────────────────────────────
  server.tool(
    {
      name: "lms_generate_eval_scenarios",
      description: `Have the platform draft simulated-student scenarios for the lesson's current AI task (uses the school's AI key). Replaces untouched previously generated scenarios; scenarios you or the teacher edited are kept. Review the drafts with lms_list_eval_cases and tweak with lms_update_eval_case. ${WORKFLOW}`,
      schema: z.object({
        lesson_id: z.number().describe("The lesson ID"),
        count: z.number().int().min(1).max(4).optional().describe("How many scenarios to draft (1-4)"),
      }),
      annotations: WRITE,
    },
    async ({ lesson_id, count }, ctx) =>
      run(ctx, lesson_id, async (call) => {
        const res = await call("POST", `/lesson-task/${lesson_id}/generate`, count !== undefined ? { count } : {}, 120_000);
        if (res.status !== 201) return errorResult(describeEvalError(res.status, res.body));
        const cases = (Array.isArray(res.body.cases) ? res.body.cases : []) as CaseRow[];
        return ok(
          { cases },
          `Drafted ${cases.length} scenario(s):\n\n${cases.map(formatCase).join("\n")}\n\nRun them with lms_run_evals.`
        );
      })
  );

  // ── lms_run_evals ──────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_run_evals",
      description: `Run every test case against the lesson's CURRENT saved AI task (save prompt changes first with lms_upsert_lesson_ai_task). The run executes in the background on the school's AI key (one run at a time per lesson, daily cap per school) and takes roughly 1–3 minutes; this call returns the run id immediately — then call lms_get_eval_run. ${WORKFLOW}`,
      schema: z.object({ lesson_id: z.number().describe("The lesson ID") }),
      annotations: WRITE,
    },
    async ({ lesson_id }, ctx) =>
      run(ctx, lesson_id, async (call) => {
        const res = await call("POST", `/lesson-task/${lesson_id}/runs`, {}, RUN_START_TIMEOUT_MS);
        if (res.status !== 202 && res.status !== 201 && res.status !== 200)
          return errorResult(describeEvalError(res.status, res.body));
        const r = res.body.run as { id?: string; status?: string } | undefined;
        const est = res.body.estimated_model_calls;
        return ok(
          { run_id: r?.id, status: r?.status ?? "queued", estimated_model_calls: est },
          `Test run started: \`${r?.id}\` (${r?.status ?? "queued"}${typeof est === "number" ? `, ~${est} model calls on the school's AI key` : ""}).\n\nCall lms_get_eval_run with run_id "${r?.id}" in ~1–3 minutes to read the report.`
        );
      })
  );

  // ── lms_get_eval_run ───────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_eval_run",
      description:
        "Read a test run's report as markdown: status, task version, summary, one line per case (✓/✗, completed vs expected, turn, deviation) and the failed criteria with evidence. If the run is still queued/running, call again in a minute. Set include_transcripts to read the full conversations (long). Use the failures to improve the prompt with lms_upsert_lesson_ai_task, then lms_run_evals again.",
      schema: z.object({
        run_id: z.string().describe("The run ID returned by lms_run_evals / lms_list_eval_runs"),
        include_transcripts: z.boolean().optional().describe("Include each case's full conversation (default false)"),
      }),
      annotations: READ_ONLY,
    },
    async ({ run_id, include_transcripts }, ctx) =>
      run(ctx, null, async (call) => {
        const res = await call("GET", `/runs/${encodeURIComponent(run_id)}`);
        if (res.status !== 200) return errorResult(describeEvalError(res.status, res.body));
        const runRow = (res.body.run ?? {}) as Record<string, unknown>;
        const results = (Array.isArray(res.body.results) ? res.body.results : []) as ResultRow[];
        const structuredResults = results.map((r) => (include_transcripts ? r : { ...r, transcript: undefined }));
        return ok(
          { run: runRow, results: structuredResults },
          formatRunReport(run_id, runRow, results, include_transcripts === true)
        );
      })
  );

  // ── lms_list_eval_runs ─────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_eval_runs",
      description:
        "List the most recent test runs (up to 20) for a lesson's AI task with status, task version and summary — use it to compare versions before/after a prompt change. Open one with lms_get_eval_run.",
      schema: z.object({ lesson_id: z.number().describe("The lesson ID") }),
      annotations: READ_ONLY,
    },
    async ({ lesson_id }, ctx) =>
      run(ctx, lesson_id, async (call) => {
        const res = await call("GET", `/lesson-task/${lesson_id}/runs`);
        if (res.status !== 200) return errorResult(describeEvalError(res.status, res.body));
        const runs = (Array.isArray(res.body.runs) ? res.body.runs : []) as Record<string, unknown>[];
        const md = runs.length
          ? runs
              .map((r) => `- \`${r.id}\` — ${String(r.status)} — ${versionNo(r)} — ${String(r.created_at ?? "")}${summaryLine(r.summary) ? ` — ${summaryLine(r.summary)}` : ""}`)
              .join("\n")
          : "No runs yet. Call lms_run_evals.";
        return ok({ lesson_id, runs }, `# Test runs for lesson ${lesson_id} (${runs.length})\n\n${md}`);
      })
  );

  // ── lms_get_task_version_metrics ───────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_task_version_metrics",
      description:
        "Real-student outcomes per task version for a lesson's AI task: how many students used each version, how many completed, the median turns to complete and how many abandoned. Use it to check whether a prompt change helped real learners, not just the tests.",
      schema: z.object({ lesson_id: z.number().describe("The lesson ID") }),
      annotations: READ_ONLY,
    },
    async ({ lesson_id }, ctx) =>
      run(ctx, lesson_id, async (call) => {
        const res = await call("GET", `/lesson-task/${lesson_id}/metrics`);
        if (res.status !== 200) return errorResult(describeEvalError(res.status, res.body));
        const versions = (Array.isArray(res.body.versions) ? res.body.versions : []) as Record<string, unknown>[];
        const md = versions.length
          ? "| Version | Students | Completed | Median turns to complete | Abandoned |\n|---|---|---|---|---|\n" +
            versions
              .map((v) => `| v${String(v.version_no)} | ${String(v.students ?? 0)} | ${String(v.completed ?? 0)} | ${v.median_turns_to_complete ?? "—"} | ${String(v.abandoned ?? 0)} |`)
              .join("\n")
          : "No student activity recorded for this task yet.";
        return ok({ lesson_id, versions }, `# Task version metrics for lesson ${lesson_id}\n\n${md}`);
      })
  );
}
