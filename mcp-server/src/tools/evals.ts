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
export type EvalTargetKind = "lesson" | "exercise" | "exam";

export function describeEvalError(status: number, body: Record<string, unknown>, kind: EvalTargetKind = "lesson"): string {
  const err = body.error;
  const code =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : null;

  switch (code) {
    case "no_cases":
      if (kind === "exam")
        return "This exam has no graded-exam cases yet. Save a sample answer with lms_create_eval_case (exam_id, answers, expected_points) first, then run again.";
      return kind === "exercise"
        ? "This exercise has no graded-answer cases yet. Draft sample answers with lms_generate_eval_answers or add your own with lms_create_eval_case (exercise_id, content, expected_score) first, then run again."
        : "This lesson has no test cases yet. Save a golden chat with lms_create_eval_case (kind 'golden_chat') or generate simulated-student scenarios with lms_generate_eval_scenarios first, then run again.";
    case "no_ai_questions":
      return "This exam has no free-text questions, so the AI grader has nothing to test. Multiple-choice and true/false questions are scored exactly by the app and are not covered by these tests. Add a free-text question with lms_add_exam_question first, then run again.";
    case "unknown_question":
      return "One of the question IDs in `answers` or `expected_points` does not belong to this exam. Read the exam's question IDs with lms_get_exam, then try again.";
    case "plan_required":
      return "The school's plan does not include AI grading, so exam tests cannot run. An admin must move the school to a plan that includes AI grading first.";
    case "unsupported_type":
      return "This exercise type has no graded-answer tests. Only AI-graded essay, discussion, coding_challenge and artifact exercises can be tested.";
    case "no_task":
      return "This lesson has no AI task yet. Create one with lms_upsert_lesson_ai_task before creating cases or running tests.";
    case "run_in_progress":
      return `A test run is already in progress for this ${kind} (one at a time). Wait for it to finish — check it with lms_list_eval_runs / lms_get_eval_run — then start another.`;
    case "run_limit":
      return `Daily test-run limit reached for this school${typeof body.limit === "number" ? ` (${body.limit} per 24 h)` : ""}. Try again tomorrow.`;
    case "case_limit":
      return `This ${kind} already has the maximum number of test cases${typeof body.limit === "number" ? ` (${body.limit})` : ""}. Delete or merge some (an admin can use lms_delete_eval_case) before adding more.`;
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

export const GRADED_CATEGORIES = [
  "high", "mid", "low", "boundary", "injection", "keyword_stuffing", "off_topic", "short_correct", "custom",
] as const;

export interface GradedCaseArgs {
  name: string;
  importance_note?: string;
  content: string;
  expected_score: number;
  tolerance?: number;
  expected_passed?: boolean | null;
  category?: (typeof GRADED_CATEGORIES)[number];
}

/** Build the POST body for a graded_answer case (exercise target). */
export function buildGradedCaseBody(a: GradedCaseArgs): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (!a.content || !a.content.trim()) return { ok: false, error: "A graded case needs `content` (the sample student answer to grade)." };
  if (typeof a.expected_score !== "number") return { ok: false, error: "A graded case needs `expected_score` (0-100, what a correct grader should give this answer)." };
  return {
    ok: true,
    body: {
      kind: "graded_answer",
      source: "teacher",
      name: a.name,
      ...(a.importance_note !== undefined ? { importance_note: a.importance_note } : {}),
      input: { content: a.content },
      expected: {
        score: a.expected_score,
        tolerance: a.tolerance ?? 10,
        passed: a.expected_passed ?? null,
        ...(a.category ? { category: a.category } : {}),
      },
    },
  };
}

export interface ExamCaseArgs {
  name: string;
  importance_note?: string;
  answers: Record<string, string>;
  expected_points: Record<string, number>;
  tolerance?: number;
  category?: (typeof GRADED_CATEGORIES)[number];
}

/**
 * Build the POST body for a graded_exam case (exam target). `answers` maps
 * free-text question ids to the sample answer; `expected_points` maps question
 * ids to the points a correct grader should award. Tolerance is a percentage of
 * each question's points (default 10), used for the total as well.
 */
export function buildExamCaseBody(a: ExamCaseArgs): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (Object.keys(a.answers ?? {}).length === 0)
    return { ok: false, error: "A graded exam case needs `answers` (question_id → the sample answer text, or the option id for a multiple-choice question)." };
  const ids = Object.keys(a.expected_points ?? {});
  if (ids.length === 0)
    return { ok: false, error: "A graded exam case needs `expected_points` (question_id → the points a correct grader should award for that answer)." };
  const tolerance = a.tolerance ?? 10;
  const questions = Object.fromEntries(
    ids.map((id) => [id, { points_earned: a.expected_points[id], tolerance }])
  );
  return {
    ok: true,
    body: {
      kind: "graded_exam",
      name: a.name,
      ...(a.importance_note !== undefined ? { importance_note: a.importance_note } : {}),
      input: { answers: a.answers },
      expected: {
        questions,
        total_tolerance: tolerance,
        ...(a.category ? { category: a.category } : {}),
      },
    },
  };
}

/** Exactly one of lesson_id / exercise_id / exam_id; returns the app path prefix. */
export function resolveEvalTarget(
  a: { lesson_id?: number; exercise_id?: number; exam_id?: number }
): { ok: true; kind: EvalTargetKind; id: number; base: string } | { ok: false; error: string } {
  const picked = [a.lesson_id, a.exercise_id, a.exam_id].filter((v) => v !== undefined).length;
  if (picked !== 1)
    return {
      ok: false,
      error:
        "Pass exactly one of `lesson_id` (a lesson's AI task), `exercise_id` (an AI-graded exercise: essay, discussion, coding_challenge, artifact) or `exam_id` (an exam's free-text questions).",
    };
  if (a.lesson_id !== undefined) return { ok: true, kind: "lesson", id: a.lesson_id, base: `/lesson-task/${a.lesson_id}` };
  if (a.exercise_id !== undefined) return { ok: true, kind: "exercise", id: a.exercise_id, base: `/exercise/${a.exercise_id}` };
  return { ok: true, kind: "exam", id: a.exam_id as number, base: `/exam/${a.exam_id}` };
}

/** Ownership owner for run(): a lesson id, or a tagged exercise/exam id. */
export type EvalOwner = number | null | { exercise: number } | { exam: number };

export function ownerOfTarget(t: { kind: EvalTargetKind; id: number }): EvalOwner {
  if (t.kind === "lesson") return t.id;
  return t.kind === "exercise" ? { exercise: t.id } : { exam: t.id };
}

/** Expected block of a case or result, across all target kinds. */
interface ExpectedShape {
  completed?: boolean | null;
  score?: number;
  tolerance?: number;
  passed?: boolean | null;
  category?: string;
  questions?: Record<string, { points_earned?: number; tolerance?: number }> | null;
  total_tolerance?: number;
}

interface CaseRow {
  id: string;
  kind: string;
  source?: string;
  name: string;
  importance_note?: string | null;
  expected?: ExpectedShape | null;
  must_keep?: string[] | null;
  input?: Record<string, unknown> | null;
  teacher_edited?: boolean;
}

function expectedLabel(v: boolean | null | undefined): string {
  return v === true ? "should complete" : v === false ? "should NOT complete" : "either outcome ok";
}

function formatGradedCase(c: CaseRow): string {
  const e = c.expected ?? {};
  const unverified = c.source === "generated" && !c.teacher_edited;
  const passed = e.passed == null ? "pass/fail derived from the passing score" : e.passed ? "should pass" : "should fail";
  const lines = [
    `- **${c.name}** (id \`${c.id}\`, graded answer${e.category ? `, ${e.category}` : ""}${c.source && c.source !== "teacher" ? `, ${c.source}` : ""}${c.teacher_edited ? ", edited" : ""}${unverified ? ", UNVERIFIED — review the expected score" : ""}) — expected score ${e.score ?? "?"} ±${e.tolerance ?? 10}, ${passed}`,
  ];
  if (c.importance_note) lines.push(`  - why it matters: ${c.importance_note}`);
  const content = String((c.input ?? {}).content ?? "");
  if (content) lines.push(`  - answer: ${content.length > 300 ? `${content.slice(0, 300)}…` : content}`.replace(/\n/g, " "));
  return lines.join("\n");
}

function formatExamCase(c: CaseRow): string {
  const e = c.expected ?? {};
  const unverified = c.source === "generated" && !c.teacher_edited;
  const questions = Object.entries(e.questions ?? {});
  const answers = (c.input ?? {}).answers;
  const answerMap = answers && typeof answers === "object" ? (answers as Record<string, unknown>) : {};
  const lines = [
    `- **${c.name}** (id \`${c.id}\`, graded exam${e.category ? `, ${e.category}` : ""}${c.source && c.source !== "teacher" ? `, ${c.source}` : ""}${c.teacher_edited ? ", edited" : ""}${unverified ? ", UNVERIFIED — review the expected points" : ""}) — ${questions.length} question(s), total tolerance ±${e.total_tolerance ?? 10}`,
  ];
  if (c.importance_note) lines.push(`  - why it matters: ${c.importance_note}`);
  for (const [qid, q] of questions) {
    const raw = String(answerMap[qid] ?? "");
    const snippet = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
    lines.push(
      `  - question \`${qid}\`: expected ${q.points_earned ?? "?"} pts ±${q.tolerance ?? e.total_tolerance ?? 10}${snippet ? ` — answer: ${snippet.replace(/\n/g, " ")}` : " — (no answer)"}`
    );
  }
  return lines.join("\n");
}

export function formatCase(c: CaseRow): string {
  if (c.kind === "graded_answer") return formatGradedCase(c);
  if (c.kind === "graded_exam") return formatExamCase(c);
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
/** One free-text or closed question's outcome inside an exam result (output.questions). */
interface QuestionOutcome {
  question_id: string;
  question_type?: string;
  auto?: boolean;
  points_possible?: number | null;
  expected_points?: number | null;
  points_per_repeat?: number[] | null;
  median?: number | null;
  deviation?: number | null;
  flip?: boolean;
  unstable?: boolean;
  inflated?: boolean;
  removed?: boolean;
}

const isGradedKind = (kind: string) => kind === "graded_answer" || kind === "graded_exam";

interface ResultRow {
  case_name: string;
  case_kind: string;
  completed: boolean | null;
  completed_turn: number | null;
  expected?: ExpectedShape | null;
  scores?: number[] | null;
  score?: number | null;
  score_stddev?: number | null;
  output?: {
    feedback?: string;
    overall_feedback?: string;
    strengths?: string[];
    improvements?: string[];
    passed?: boolean;
    questions?: QuestionOutcome[] | null;
  } | null;
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

/** Markdown table of an exam result's per-question outcomes. */
function questionTable(qs: QuestionOutcome[]): string[] {
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines = ["| Question | Auto | Expected | Median | Deviation | Flags |", "|---|---|---|---|---|---|"];
  for (const q of qs) {
    const flags = [
      q.flip ? "flip" : "",
      q.unstable ? "unstable" : "",
      q.inflated ? "inflated" : "",
      q.removed ? "question removed" : "",
    ].filter((f) => f !== "");
    const expected =
      q.expected_points != null ? `${q.expected_points}${q.points_possible != null ? `/${q.points_possible}` : ""}` : "—";
    const dev = q.deviation != null ? `${q.deviation}%` : "—";
    lines.push(
      `| \`${cell(String(q.question_id))}\` | ${q.auto ? "yes" : "no"} | ${expected} | ${q.median ?? "—"} | ${dev} | ${flags.length ? flags.join(", ") : "—"} |`
    );
  }
  return lines;
}

/** Expected total as a percentage of the exam's points, ignoring removed questions. */
function expectedTotalPercent(qs: QuestionOutcome[]): number | null {
  const live = qs.filter((q) => !q.removed);
  const possible = live.reduce((s, q) => s + (q.points_possible ?? 0), 0);
  if (possible <= 0) return null;
  const expected = live.reduce((s, q) => s + (q.expected_points ?? 0), 0);
  return Math.round((100 * expected) / possible);
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
    if (r.case_kind === "graded_exam") {
      const e = r.expected ?? {};
      const qs = r.output?.questions ?? [];
      const scores = Array.isArray(r.scores) ? r.scores : [];
      const expTotal = qs.length ? expectedTotalPercent(qs) : null;
      out.push(
        `${mark} **${r.case_name}** (graded exam${e.category ? `, ${e.category}` : ""}) — expected total ${expTotal ?? "n/a"}% ±${e.total_tolerance ?? 10}, got median ${r.score ?? "n/a"}${scores.length ? ` (repeats: ${scores.join(", ")}` + `${r.score_stddev != null ? `, stddev ${r.score_stddev}` : ""})` : ""}${deviationText(r.deviation) ? ` — deviation: ${deviationText(r.deviation)}` : ""}${r.error ? ` — error: ${r.error}` : ""}`
      );
    } else if (r.case_kind === "graded_answer") {
      const e = r.expected ?? {};
      const scores = Array.isArray(r.scores) ? r.scores : [];
      const inflated = e.category === "injection" && e.score != null && scores.some((x) => x > e.score!);
      out.push(
        `${mark} **${r.case_name}** (graded answer${e.category ? `, ${e.category}` : ""}) — expected ${e.score ?? "?"} ±${e.tolerance ?? 10}, got median ${r.score ?? "n/a"}${scores.length ? ` (repeats: ${scores.join(", ")}` + `${r.score_stddev != null ? `, stddev ${r.score_stddev}` : ""})` : ""}${deviationText(r.deviation) ? ` — deviation: ${deviationText(r.deviation)}` : ""}${inflated ? " — INFLATED: injection scored above expected" : ""}${r.error ? ` — error: ${r.error}` : ""}`
      );
    } else {
      const outcome = r.completed == null ? "n/a" : r.completed ? `completed${r.completed_turn != null ? ` at turn ${r.completed_turn}` : ""}` : "did not complete";
      const dev = deviationText(r.deviation);
      const expected = r.expected?.completed == null ? "" : ` (expected: ${expectedLabel(r.expected.completed)})`;
      out.push(
        `${mark} **${r.case_name}** (${r.case_kind === "scenario" ? "simulated student" : "golden chat"}) — ${outcome}${expected}${dev ? ` — deviation: ${dev}/100` : ""}${r.error ? ` — error: ${r.error}` : ""}`
      );
    }
    const qs = r.output?.questions ?? [];
    if (qs.length) out.push("", ...questionTable(qs), "");
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

  const graded = results.filter((r) => isGradedKind(r.case_kind));
  if (graded.length) {
    out.push("", "## Grader feedback (median repeat)", "");
    for (const r of graded) {
      const o = r.output;
      if (!o) continue;
      const passed = typeof o.passed === "boolean" ? o.passed : r.passed === true;
      out.push(`**${r.case_name}** — ${passed ? "passed" : "not passed"}: ${o.feedback ?? o.overall_feedback ?? ""}`);
    }
  }

  const hasConversation = results.some((r) => !isGradedKind(r.case_kind));
  if (includeTranscripts && hasConversation) {
    out.push("", "## Transcripts", "");
    for (const r of results) {
      out.push(`### ${r.case_name}`);
      const t = r.transcript ?? [];
      if (!t.length) out.push("(no transcript)");
      for (const m of t) out.push(`- **${m.role === "user" ? "Student" : "Tutor"}:** ${m.text}`);
      out.push("");
    }
  } else if (hasConversation) {
    out.push("", "_Transcripts omitted — call again with include_transcripts: true to read the conversations._");
  }
  if (status === "completed" || status === "succeeded" || status === "finished" || status === "done") {
    const examGraded = results.some((r) => r.case_kind === "graded_exam");
    const answerGraded = results.some((r) => r.case_kind === "graded_answer");
    const target = examGraded
      ? "the exam's free-text questions with lms_update_exam_question (never edit expected points just to pass)"
      : answerGraded
        ? "the exercise's grading prompt/rubric with lms_update_exercise (never edit expected scores just to pass)"
        : "task with lms_upsert_lesson_ai_task";
    const compare = examGraded ? "lms_list_eval_runs" : "lms_list_eval_runs / lms_get_task_version_metrics";
    out.push("", `Next: if cases failed, adjust the ${target}, then lms_run_evals again and compare with ${compare}.`);
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

const GRADED_EXPLAINER =
  "AI-graded exercises (types essay, discussion, coding_challenge, artifact) are tested with GRADED ANSWER cases: a sample student answer plus the score a correct grader should give it (expected_score 0-100, tolerance default 10). A run grades every case 3 times with the exercise's CURRENT saved grader and compares the median score to the expected one; it also fails a case if the pass/fail verdict flips against expectation. Injection-category cases (an answer that tries to talk the grader into 100) must NEVER score above expected_score, in any repeat. Generated cases are UNVERIFIED until a teacher reviews them.";

const EXAM_EXPLAINER =
  "EXAMS (exam_id): only the AI-graded free-text questions are tested. A graded-exam case is one sample student answer per question (answers: question_id → text) plus the points a correct grader should award (expected_points: question_id → points). tolerance (default 10) is a percentage of each question's points. Multiple-choice and true/false questions are scored exactly by the app, so they are not AI-tested. Get question IDs with lms_get_exam. Each run grades every case 3 times.";

const TargetFields = {
  lesson_id: z.number().optional().describe("The lesson ID (tests the lesson's AI task). Pass exactly one of lesson_id / exercise_id / exam_id"),
  exercise_id: z.number().optional().describe("The exercise ID (tests an AI-graded essay/discussion/coding_challenge/artifact exercise). Pass exactly one of lesson_id / exercise_id / exam_id"),
  exam_id: z.number().optional().describe("The exam ID (tests the exam's AI-graded free-text questions). Pass exactly one of lesson_id / exercise_id / exam_id"),
};

const ExamFields = {
  answers: z
    .record(z.string(), z.string().max(5000))
    .optional()
    .describe("Exam only: sample answer per question, keyed by question ID (text for free-text, option ID for multiple choice). Max 5000 chars each"),
  expected_points: z
    .record(z.string(), z.number().min(0))
    .optional()
    .describe("Exam only: points a correct grader should award per question, keyed by question ID"),
};

const GradedFields = {
  content: z.string().min(1).max(20000).optional().describe("Graded answers only: the sample student answer to be graded (max 20000 chars)"),
  expected_score: z.number().int().min(0).max(100).optional().describe("Graded answers only: score 0-100 a correct grader should give this answer"),
  tolerance: z.number().int().min(0).max(50).optional().describe("Graded answers only: allowed distance from expected_score (default 10)"),
  expected_passed: z.boolean().nullable().optional().describe("Graded answers only: true/false forces the expected pass verdict; null/omitted = derive from the exercise's passing score"),
  category: z.enum(GRADED_CATEGORIES).optional().describe("Graded answers only: high | mid | low | boundary | injection | keyword_stuffing | off_topic | short_correct | custom. 'injection' cases must never be scored above expected_score"),
};

export function registerEvalTools(server: LmsServer) {
  /**
   * Shared handler plumbing: session, app origin, optional lesson ownership
   * pre-check, then `fn`. Never throws.
   */
  async function run(
    ctx: unknown,
    owner: EvalOwner,
    fn: (call: (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, payload?: unknown, timeoutMs?: number) => Promise<EvalHttpResult>, session: LmsSession) => Promise<ReturnType<typeof ok> | ReturnType<typeof okText> | ReturnType<typeof errorResult>>
  ) {
    let session: LmsSession;
    try {
      session = LmsSession.fromContext(ctx);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
    try {
      if (owner !== null && typeof owner === "object") {
        if ("exam" in owner) await session.verifyExamOwnership(owner.exam);
        else await session.verifyExerciseOwnership(owner.exercise);
      } else if (owner !== null) await session.verifyLessonOwnership(owner);
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
      description: `List the test cases of a lesson's AI task (pass lesson_id): golden chats (saved conversations replayed against the current prompt) and scenarios (simulated students), plus whether scenarios auto-regenerate. Or list the graded-answer cases of an AI-graded exercise (pass exercise_id), or the graded-exam cases of an exam (pass exam_id). ${GRADED_EXPLAINER} ${EXAM_EXPLAINER} ${WORKFLOW}`,
      schema: z.object({ ...TargetFields }),
      annotations: READ_ONLY,
    },
    async (input, ctx) => {
      const t = resolveEvalTarget(input);
      if (!t.ok) return errorResult(t.error);
      return run(ctx, ownerOfTarget(t), async (call) => {
        const res = await call("GET", `${t.base}/cases`);
        if (res.status !== 200) return errorResult(describeEvalError(res.status, res.body, t.kind));
        const cases = (Array.isArray(res.body.cases) ? res.body.cases : []) as CaseRow[];
        const md = cases.length
          ? cases.map(formatCase).join("\n")
          : t.kind === "lesson"
            ? "No test cases yet. Create a golden with lms_create_eval_case or call lms_generate_eval_scenarios."
            : t.kind === "exam"
              ? "No graded-exam cases yet. Save a sample answer with lms_create_eval_case (exam_id, answers, expected_points)."
              : "No graded cases yet. Call lms_generate_eval_answers to draft 8 sample answers, or add your own with lms_create_eval_case.";
        if (t.kind === "exam")
          return ok({ exam_id: t.id, cases }, `# Graded-exam cases for exam ${t.id} (${cases.length})\n\n${md}`);
        if (t.kind === "exercise")
          return ok({ exercise_id: t.id, cases }, `# Graded-answer cases for exercise ${t.id} (${cases.length})\n\n${md}`);
        const suite = res.body.suite as { auto_regenerate?: boolean } | undefined;
        return ok(
          { lesson_id: t.id, cases, suite: suite ?? { auto_regenerate: true } },
          `# Test cases for lesson ${t.id} (${cases.length})\n\nScenarios auto-regenerate on task changes: ${suite?.auto_regenerate === false ? "no" : "yes"}\n\n${md}`
        );
      });
    }
  );

  // ── lms_create_eval_case ───────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_eval_case",
      description: `Add a test case to a lesson's AI task. kind 'golden_chat': a conversation (messages) that must keep working after you change the prompt — optionally record whether it completed (completed/completed_turn). kind 'scenario': a simulated student (persona, goal, optional scripted first messages, max_turns) played by the platform. Both can set expected_completed (true = the task must complete, false = must NOT complete, omit/null = either) and must_keep (short criteria a judge checks, e.g. 'Tutor never gives the final answer'; max 8). Max 20 cases per lesson. EXERCISES: pass exercise_id instead of lesson_id (kind is implied 'graded_answer') with content + expected_score (+ optional tolerance default 10, expected_passed, category) to save one sample answer. EXAMS: pass exam_id instead (kind is implied 'graded_exam') with answers (question_id → text) + expected_points (question_id → points), optional tolerance and category. ${GRADED_EXPLAINER} ${EXAM_EXPLAINER} ${WORKFLOW}`,
      schema: z.object({
        ...TargetFields,
        kind: z.enum(["golden_chat", "scenario", "graded_answer", "graded_exam"]).optional().describe("Lessons: 'golden_chat' needs messages; 'scenario' needs persona. Exercises: omit (always 'graded_answer'). Exams: omit (always 'graded_exam')"),
        ...GradedFields,
        ...ExamFields,
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
      const t = resolveEvalTarget(input);
      if (!t.ok) return errorResult(t.error);
      let built: ReturnType<typeof buildCreateCaseBody>;
      if (t.kind === "exam") {
        if (input.kind !== undefined && input.kind !== "graded_exam")
          return errorResult("Exams only support kind 'graded_exam' (omit kind).");
        if (
          input.content !== undefined || input.expected_score !== undefined || input.expected_passed !== undefined ||
          input.messages || input.persona || input.goal || input.script || input.max_turns !== undefined ||
          input.must_keep || input.expected_completed !== undefined || input.completed !== undefined || input.completed_turn !== undefined
        )
          return errorResult("content/expected_score/expected_passed and the lesson/exercise fields (messages, persona, must_keep, expected_completed, completed) don't apply to exam cases; use answers + expected_points.");
        built = buildExamCaseBody({
          name: input.name,
          importance_note: input.importance_note,
          answers: input.answers ?? {},
          expected_points: input.expected_points ?? {},
          tolerance: input.tolerance,
          category: input.category,
        });
      } else if (t.kind === "exercise") {
        if (input.kind !== undefined && input.kind !== "graded_answer")
          return errorResult("Exercises only support kind 'graded_answer' (omit kind).");
        if (input.messages || input.persona || input.goal || input.script || input.max_turns !== undefined || input.must_keep)
          return errorResult("messages/persona/goal/script/max_turns/must_keep belong to lesson AI-task cases, not graded answers.");
        if (input.answers !== undefined || input.expected_points !== undefined)
          return errorResult("answers/expected_points belong to exam cases; use exam_id.");
        built = buildGradedCaseBody({
          name: input.name,
          importance_note: input.importance_note,
          content: input.content ?? "",
          expected_score: input.expected_score as number,
          tolerance: input.tolerance,
          expected_passed: input.expected_passed,
          category: input.category,
        });
      } else {
        if (input.kind === undefined || input.kind === "graded_answer" || input.kind === "graded_exam")
          return errorResult("Lesson cases need kind 'golden_chat' or 'scenario'. For graded answers pass exercise_id, for exam questions pass exam_id, instead of lesson_id.");
        if (input.content !== undefined || input.expected_score !== undefined || input.category !== undefined)
          return errorResult("content/expected_score/tolerance/category belong to exercise graded answers; use exercise_id.");
        if (input.answers !== undefined || input.expected_points !== undefined)
          return errorResult("answers/expected_points belong to exam cases; use exam_id.");
        built = buildCreateCaseBody({ ...input, kind: input.kind });
      }
      if (!built.ok) return errorResult(built.error);
      return run(ctx, ownerOfTarget(t), async (call) => {
        const res = await call("POST", `${t.base}/cases`, built.body);
        if (res.status !== 201) return errorResult(describeEvalError(res.status, res.body, t.kind));
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
        "Edit a test case: name, importance_note, expected_completed, must_keep, and — for scenarios — persona/goal/script/max_turns. Graded answers (exercise cases): content, expected_score, tolerance, expected_passed, category. Golden transcripts never change (delete and re-create instead). Editing a generated scenario marks it teacher-edited so it is no longer replaced when scenarios regenerate. When changing scenario fields, pass lesson_id so unspecified scenario fields keep their current value.",
      schema: z.object({
        case_id: z.string().describe("The case ID (uuid from lms_list_eval_cases)"),
        lesson_id: z.number().optional().describe("Required when editing scenario fields (persona/goal/script/max_turns): used to merge with the current scenario"),
        name: z.string().min(1).max(200).optional(),
        importance_note: z.string().max(2000).nullable().optional(),
        expected_completed: z.boolean().nullable().optional().describe("true / false / null (either)"),
        must_keep: z.array(z.string().min(1).max(300)).max(8).optional().describe("Replaces the whole list"),
        ...GradedFields,
        ...ScenarioFields,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input, ctx) => {
      const scenarioEdit =
        input.persona !== undefined || input.goal !== undefined || input.script !== undefined || input.max_turns !== undefined;
      const gradedEdit =
        input.content !== undefined || input.expected_score !== undefined || input.tolerance !== undefined ||
        input.expected_passed !== undefined || input.category !== undefined;
      const lessonEdit = scenarioEdit || input.expected_completed !== undefined || input.must_keep !== undefined;
      if (gradedEdit && (lessonEdit || input.lesson_id !== undefined))
        return errorResult("content/expected_score/tolerance/expected_passed/category belong to exercise graded answers; expected_completed/must_keep/persona/goal/script/max_turns and lesson_id belong to lesson cases. Don't mix them.");
      if (scenarioEdit && input.lesson_id === undefined)
        return errorResult("Pass lesson_id when editing scenario fields (persona/goal/script/max_turns) so they can be merged with the current scenario.");
      return run(ctx, input.lesson_id ?? null, async (call) => {
        const patch: Record<string, unknown> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.importance_note !== undefined) patch.importance_note = input.importance_note;
        if (input.expected_completed !== undefined) patch.expected = { completed: input.expected_completed };
        if (input.must_keep !== undefined) patch.must_keep = input.must_keep;
        if (input.content !== undefined) patch.input = { content: input.content };
        if (
          input.expected_score !== undefined || input.tolerance !== undefined ||
          input.expected_passed !== undefined || input.category !== undefined
        ) {
          patch.expected = {
            ...(patch.expected as object | undefined),
            ...(input.expected_score !== undefined ? { score: input.expected_score } : {}),
            ...(input.tolerance !== undefined ? { tolerance: input.tolerance } : {}),
            ...(input.expected_passed !== undefined ? { passed: input.expected_passed } : {}),
            ...(input.category !== undefined ? { category: input.category } : {}),
          };
        }
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

  // ── lms_generate_eval_answers ──────────────────────────────────────────────
  server.tool(
    {
      name: "lms_generate_eval_answers",
      description: `Have the platform draft 8 sample student answers for an AI-graded exercise (essay, discussion, coding_challenge, artifact), one per category: high, mid, low, boundary (right at the passing score), injection (tries to make the grader give 100), keyword_stuffing, off_topic and short_correct. Each comes with an expected score. They are saved as UNVERIFIED cases — review them with lms_list_eval_cases and correct expected scores with lms_update_eval_case (that marks them verified). Uses the school's AI key; max 20 cases per exercise (409 case_limit if none fit). ${GRADED_EXPLAINER}`,
      schema: z.object({ exercise_id: z.number().describe("The exercise ID") }),
      annotations: WRITE,
    },
    async ({ exercise_id }, ctx) =>
      run(ctx, { exercise: exercise_id }, async (call) => {
        const res = await call("POST", `/exercise/${exercise_id}/generate`, {}, 120_000);
        if (res.status !== 201) return errorResult(describeEvalError(res.status, res.body, "exercise"));
        const cases = (Array.isArray(res.body.cases) ? res.body.cases : []) as CaseRow[];
        return ok(
          { cases },
          `Drafted ${cases.length} sample answer(s) (unverified):\n\n${cases.map(formatCase).join("\n")}\n\nReview the expected scores, then run them with lms_run_evals (exercise_id).`
        );
      })
  );

  // ── lms_run_evals ──────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_run_evals",
      description: `Run every test case against the lesson's CURRENT saved AI task (save prompt changes first with lms_upsert_lesson_ai_task), or — with exercise_id — against the exercise's CURRENT saved grader (save changes first with lms_update_exercise), or — with exam_id — against the exam's CURRENT saved questions and grading (save changes first with lms_update_exam_question): each graded answer (or each exam's free-text answer set) is graded 3 times, so cost is cases × 3 model calls (returned as estimated_model_calls); injection cases must never score above expected. An exam with no free-text questions is rejected (no_ai_questions). The run executes in the background on the school's AI key (one run at a time per lesson, daily cap per school) and takes roughly 1–3 minutes; this call returns the run id immediately — then call lms_get_eval_run. ${WORKFLOW}`,
      schema: z.object({ ...TargetFields }),
      annotations: WRITE,
    },
    async (input, ctx) => {
      const t = resolveEvalTarget(input);
      if (!t.ok) return errorResult(t.error);
      return run(ctx, ownerOfTarget(t), async (call) => {
        const res = await call("POST", `${t.base}/runs`, {}, RUN_START_TIMEOUT_MS);
        if (res.status !== 202 && res.status !== 201 && res.status !== 200)
          return errorResult(describeEvalError(res.status, res.body, t.kind));
        const r = res.body.run as { id?: string; status?: string } | undefined;
        const est = res.body.estimated_model_calls;
        return ok(
          { run_id: r?.id, status: r?.status ?? "queued", estimated_model_calls: est },
          `Test run started: \`${r?.id}\` (${r?.status ?? "queued"}${typeof est === "number" ? `, ~${est} model calls on the school's AI key` : ""}).\n\nCall lms_get_eval_run with run_id "${r?.id}" in ~1–3 minutes to read the report.`
        );
      });
    }
  );

  // ── lms_get_eval_run ───────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_eval_run",
      description:
        "Read a test run's report as markdown: status, task version, summary, one line per case (✓/✗, completed vs expected, turn, deviation) and the failed criteria with evidence. For exercise runs: per case expected score ±tolerance vs the median score, the 3 repeat scores, stddev, deviation, INFLATED flag for injections, and the grader's feedback; summary has inflated_injections, pass_flips (majority verdict wrong), unstable_cases (a repeat disagreed), mean_deviation, max_stddev. For exam runs: per case the expected total vs the median total, then a per-question table (question ID, auto-scored or AI-graded, expected vs median points, deviation %, flags: flip, unstable, inflated, question removed); summary also has question_flips. If the run is still queued/running, call again in a minute. Set include_transcripts to read the full conversations (long). Use the failures to improve the prompt with lms_upsert_lesson_ai_task, then lms_run_evals again.",
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
        "List the most recent test runs (up to 20) for a lesson's AI task (lesson_id), an AI-graded exercise (exercise_id) or an exam (exam_id) with status, task version and summary — use it to compare versions before/after a prompt change. Open one with lms_get_eval_run.",
      schema: z.object({ ...TargetFields }),
      annotations: READ_ONLY,
    },
    async (input, ctx) => {
      const t = resolveEvalTarget(input);
      if (!t.ok) return errorResult(t.error);
      const label = t.kind;
      return run(ctx, ownerOfTarget(t), async (call) => {
        const res = await call("GET", `${t.base}/runs`);
        if (res.status !== 200) return errorResult(describeEvalError(res.status, res.body));
        const runs = (Array.isArray(res.body.runs) ? res.body.runs : []) as Record<string, unknown>[];
        const md = runs.length
          ? runs
              .map((r) => `- \`${r.id}\` — ${String(r.status)} — ${versionNo(r)} — ${String(r.created_at ?? "")}${summaryLine(r.summary) ? ` — ${summaryLine(r.summary)}` : ""}`)
              .join("\n")
          : "No runs yet. Call lms_run_evals.";
        return ok({ [`${label}_id`]: t.id, runs }, `# Test runs for ${label} ${t.id} (${runs.length})\n\n${md}`);
      });
    }
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
