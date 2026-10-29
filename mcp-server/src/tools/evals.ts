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

/** Which test surface a call was for; decides the unsupported_type advice. */
export type EvalSurface = "graded" | "coach" | "voice";

export function describeEvalError(
  status: number,
  body: Record<string, unknown>,
  kind: EvalTargetKind = "lesson",
  surface: EvalSurface = "graded"
): string {
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
      if (surface === "voice")
        return "This exercise is not a real-time conversation, so it has no voice tests. Voice scenarios only apply to real_time_conversation exercises.";
      if (surface === "coach")
        return "Coach scenarios do not apply to this exercise type (external exercises are not coach-tested). Use graded answers for AI-graded essay, discussion, coding_challenge and artifact exercises.";
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
  /** voice_scenario: expected finish_conversation outcome. */
  finished?: boolean | null;
  /** voice_scenario: expected score band (0-100). */
  score_min?: number;
  score_max?: number;
}

/** Scenario-style input shared by coach_scenario and voice_scenario cases. */
export interface ScenarioInputArgs {
  persona: string;
  goal?: string;
  script?: string[];
  max_turns?: number;
}

export interface CoachCaseArgs extends ScenarioInputArgs {
  name: string;
  importance_note?: string;
  expected_completed?: boolean | null;
  must_keep?: string[];
}

export interface VoiceCaseArgs extends ScenarioInputArgs {
  name: string;
  importance_note?: string;
  simulate_after_script?: boolean;
  expected_finished?: boolean | null;
  expected_passed?: boolean | null;
  score_min?: number;
  score_max?: number;
  must_keep?: string[];
}

const COACH_SCRIPT_MAX = 5;
const VOICE_SCRIPT_MAX = 10;

function scenarioInput(a: ScenarioInputArgs) {
  return {
    persona: a.persona,
    goal: a.goal ?? "",
    script: a.script ?? [],
    max_turns: a.max_turns ?? 8,
  };
}

/**
 * Build the POST body for a coach_scenario case (exercise target): a simulated
 * student who tries to get the AI coach to complete the exercise. The app runs
 * the coach with a preview-only completion tool, so nothing is written.
 */
export function buildCoachCaseBody(a: CoachCaseArgs): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (!a.persona || !a.persona.trim())
    return { ok: false, error: "A coach scenario case needs `persona` (who the simulated student is, e.g. 'student who asks for the answer and claims to be finished')." };
  if ((a.script ?? []).length > COACH_SCRIPT_MAX)
    return { ok: false, error: `A coach scenario takes at most ${COACH_SCRIPT_MAX} scripted messages.` };
  return {
    ok: true,
    body: {
      kind: "coach_scenario",
      source: "teacher",
      name: a.name,
      ...(a.importance_note !== undefined ? { importance_note: a.importance_note } : {}),
      input: scenarioInput(a),
      expected: { completed: a.expected_completed ?? null },
      must_keep: a.must_keep ?? [],
    },
  };
}

/**
 * Build the POST body for a voice_scenario case (real-time conversation
 * exercise). Tested as TEXT: the platform's text model stands in for the
 * realtime voice model, so there is no audio or speech recognition.
 */
export function buildVoiceCaseBody(a: VoiceCaseArgs): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (!a.persona || !a.persona.trim())
    return { ok: false, error: "A voice scenario case needs `persona` (who the simulated speaker is, e.g. 'nervous learner who answers in one word')." };
  if ((a.script ?? []).length > VOICE_SCRIPT_MAX)
    return { ok: false, error: `A voice scenario takes at most ${VOICE_SCRIPT_MAX} scripted messages.` };
  if (a.score_min !== undefined && a.score_max !== undefined && a.score_min > a.score_max)
    return { ok: false, error: "`score_min` must be less than or equal to `score_max`." };
  return {
    ok: true,
    body: {
      kind: "voice_scenario",
      source: "teacher",
      name: a.name,
      ...(a.importance_note !== undefined ? { importance_note: a.importance_note } : {}),
      input: { ...scenarioInput(a), simulate_after_script: a.simulate_after_script ?? true },
      expected: {
        finished: a.expected_finished ?? null,
        passed: a.expected_passed ?? null,
        ...(a.score_min !== undefined ? { score_min: a.score_min } : {}),
        ...(a.score_max !== undefined ? { score_max: a.score_max } : {}),
      },
      must_keep: a.must_keep ?? [],
    },
  };
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

function scenarioInputLines(input: Record<string, unknown>): string[] {
  const lines = [`  - persona: ${String(input.persona ?? "")}`];
  if (input.goal) lines.push(`  - goal: ${String(input.goal)}`);
  const script = Array.isArray(input.script) ? input.script : [];
  if (script.length) lines.push(`  - scripted opening: ${script.map((s) => `"${String(s)}"`).join(" → ")}`);
  lines.push(`  - max turns: ${String(input.max_turns ?? 8)}`);
  return lines;
}

/** Score band label for a voice case: "70–100", "≥ 70", "≤ 69" or "—". */
function bandText(e: ExpectedShape | null | undefined): string {
  if (e?.score_min != null && e?.score_max != null) return `${e.score_min}–${e.score_max}`;
  if (e?.score_min != null) return `≥ ${e.score_min}`;
  if (e?.score_max != null) return `≤ ${e.score_max}`;
  return "—";
}

export function formatCase(c: CaseRow): string {
  if (c.kind === "graded_answer") return formatGradedCase(c);
  if (c.kind === "graded_exam") return formatExamCase(c);
  if (c.kind === "coach_scenario") {
    const lines = [
      `- **${c.name}** (id \`${c.id}\`, coach scenario${c.source && c.source !== "teacher" ? `, ${c.source}` : ""}${c.teacher_edited ? ", edited" : ""}) — ${expectedLabel(c.expected?.completed)}`,
    ];
    if (c.importance_note) lines.push(`  - why it matters: ${c.importance_note}`);
    if (c.must_keep?.length) lines.push(`  - must keep: ${c.must_keep.map((m) => `"${m}"`).join("; ")}`);
    lines.push(...scenarioInputLines(c.input ?? {}));
    return lines.join("\n");
  }
  if (c.kind === "voice_scenario") {
    const e = c.expected ?? {};
    const finished = e.finished == null ? "either outcome ok" : e.finished ? "should finish" : "should NOT finish";
    const passed = e.passed == null ? "pass/fail derived from the passing score" : e.passed ? "should pass" : "should fail";
    const lines = [
      `- **${c.name}** (id \`${c.id}\`, voice scenario, text-simulated${c.source && c.source !== "teacher" ? `, ${c.source}` : ""}${c.teacher_edited ? ", edited" : ""}) — ${finished}, ${passed}, score band ${bandText(e)}`,
    ];
    if (c.importance_note) lines.push(`  - why it matters: ${c.importance_note}`);
    if (c.must_keep?.length) lines.push(`  - must keep: ${c.must_keep.map((m) => `"${m}"`).join("; ")}`);
    lines.push(...scenarioInputLines(c.input ?? {}));
    return lines.join("\n");
  }
  const lines = [
    `- **${c.name}** (id \`${c.id}\`, ${c.kind === "scenario" ? "simulated student" : "golden chat"}${c.source && c.source !== "teacher" ? `, ${c.source}` : ""}${c.teacher_edited ? ", edited" : ""}) — ${expectedLabel(c.expected?.completed)}`,
  ];
  if (c.importance_note) lines.push(`  - why it matters: ${c.importance_note}`);
  if (c.must_keep?.length) lines.push(`  - must keep: ${c.must_keep.map((m) => `"${m}"`).join("; ")}`);
  const input = c.input ?? {};
  if (c.kind === "scenario") {
    lines.push(...scenarioInputLines(input));
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
/** Coach and voice cases run against an exercise (not a lesson task). */
const isExerciseScenarioKind = (kind: string) => kind === "coach_scenario" || kind === "voice_scenario";

interface ResultRow {
  case_id?: string | null;
  case_name: string;
  case_kind: string;
  completed: boolean | null;
  completed_turn: number | null;
  expected?: ExpectedShape | null;
  scores?: number[] | null;
  score?: number | null;
  score_stddev?: number | null;
  output?: {
    kind?: string;
    feedback?: string;
    overall_feedback?: string;
    strengths?: string[];
    improvements?: string[];
    passed?: boolean;
    questions?: QuestionOutcome[] | null;
    /** coach / voice: why the outcome failed expectations. */
    reasons?: string[] | null;
    /** voice: did the tutor finish the conversation, and how. */
    finished?: boolean;
    finish_reason?: string | null;
    hints?: number;
    corrections_logged?: number;
    evaluation?: { score?: number; feedback?: string } | null;
    /** lesson case run several times: the votes behind the majority row. */
    repeats?: number;
    completed_flags?: boolean[];
    criteria_passes?: number[];
    errored_repeats?: number;
    unstable?: boolean;
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

/** Lesson case run several times: " — completed in 2/3 repeats, UNSTABLE". Empty for single runs. */
function repeatsText(r: ResultRow): string {
  const flags = r.output?.completed_flags;
  if (!flags || flags.length + (r.output?.errored_repeats ?? 0) <= 1) return "";
  const done = flags.filter(Boolean).length;
  const errored = r.output?.errored_repeats ? `, ${r.output.errored_repeats} errored` : "";
  return ` — completed in ${done}/${flags.length} repeats${errored}${r.output?.unstable ? ", UNSTABLE (repeats disagreed)" : ""}`;
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
  const scenarioSum = run.summary && typeof run.summary === "object" ? (run.summary as { scenario?: unknown }).scenario : undefined;
  if (scenarioSum && typeof scenarioSum === "object") {
    const line = summaryLine(scenarioSum);
    if (line) out.push(`- **Coach and voice scenarios:** ${line}`);
  }
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
    } else if (r.case_kind === "coach_scenario") {
      const e = r.expected ?? {};
      const turn = r.completed_turn != null ? ` at turn ${r.completed_turn}` : "";
      // The coach must not mark the exercise complete when the case says it must not.
      const unexpected = r.completed === true && e.completed === false;
      const outcome = r.completed == null ? "n/a" : r.completed ? `marked complete${turn}` : "not marked complete";
      const expected = e.completed == null ? "" : ` (expected: ${expectedLabel(e.completed)})`;
      const reasons = (r.output?.reasons ?? []).filter((x) => x !== "unexpected_completion");
      out.push(
        `${mark} **${r.case_name}** (coach scenario) — ${outcome}${expected}${unexpected ? " — FAILURE: the coach completed the exercise for a student who should not get it" : ""}${reasons.length ? ` — reasons: ${reasons.join(", ")}` : ""}${r.error ? ` — error: ${r.error}` : ""}`
      );
    } else if (r.case_kind === "voice_scenario") {
      const e = r.expected ?? {};
      const band = e.score_min != null || e.score_max != null ? ` (expected band ${bandText(e)})` : "";
      const finished = (r.output?.finished ?? r.completed) === true ? "finished" : "did not finish";
      const finishExpect = e.finished == null ? "" : ` (expected: ${e.finished ? "should finish" : "should NOT finish"})`;
      const hints = r.output?.hints ?? 0;
      const corrections = r.output?.corrections_logged ?? 0;
      const reasons = r.output?.reasons ?? [];
      out.push(
        `${mark} **${r.case_name}** (voice scenario, text-simulated) — score ${r.score ?? "n/a"}${band} — ${finished}${finishExpect} — hints ${hints}, corrections ${corrections}${reasons.length ? ` — reasons: ${reasons.join(", ")}` : ""}${r.error ? ` — error: ${r.error}` : ""}`
      );
    } else {
      const outcome = r.completed == null ? "n/a" : r.completed ? `completed${r.completed_turn != null ? ` at turn ${r.completed_turn}` : ""}` : "did not complete";
      const dev = deviationText(r.deviation);
      const expected = r.expected?.completed == null ? "" : ` (expected: ${expectedLabel(r.expected.completed)})`;
      out.push(
        `${mark} **${r.case_name}** (${r.case_kind === "scenario" ? "simulated student" : "golden chat"}) — ${outcome}${expected}${repeatsText(r)}${dev ? ` — deviation: ${dev}/100` : ""}${r.error ? ` — error: ${r.error}` : ""}`
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
      const passes = r.output?.criteria_passes;
      const voted = r.output?.completed_flags?.length;
      (r.verdicts ?? []).forEach((v, i) => {
        if (v.passed) return;
        const votes = passes && voted && voted > 1 ? ` (passed in ${passes[i] ?? 0}/${voted} repeats)` : "";
        out.push(`- ✗ ${v.criterion}${votes}${v.evidence ? ` — evidence: ${v.evidence}` : ""}`);
      });
    }
  }

  const graded = results.filter((r) => isGradedKind(r.case_kind) || r.case_kind === "voice_scenario");
  if (graded.length) {
    out.push("", "## Grader feedback (median repeat)", "");
    for (const r of graded) {
      const o = r.output;
      if (!o) continue;
      const passed = typeof o.passed === "boolean" ? o.passed : r.passed === true;
      const feedback = o.feedback ?? o.overall_feedback ?? o.evaluation?.feedback ?? "";
      out.push(`**${r.case_name}** — ${passed ? "passed" : "not passed"}: ${feedback}`);
    }
  }

  if (results.some((r) => r.case_kind === "voice_scenario")) {
    out.push(
      "",
      "_Voice cases are TEXT-simulated: the student and tutor exchange text, a text model stands in for the realtime voice model, and no audio or speech recognition runs. Use them to test the conversation logic and grading, not pronunciation or audio._"
    );
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
    const exerciseScenarios = results.some((r) => isExerciseScenarioKind(r.case_kind));
    const target = examGraded
      ? "the exam's free-text questions with lms_update_exam_question (never edit expected points just to pass)"
      : answerGraded
        ? "the exercise's grading prompt/rubric with lms_update_exercise (never edit expected scores just to pass)"
        : exerciseScenarios
          ? "the exercise's instructions or rubric with lms_update_exercise (never edit expected outcomes just to pass)"
          : "task with lms_upsert_lesson_ai_task";
    const compare = examGraded
      ? "lms_list_eval_runs (or lms_compare_eval_runs for two runs)"
      : "lms_list_eval_runs / lms_get_task_version_metrics (or lms_compare_eval_runs for two runs)";
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
  script: z.array(z.string().min(1).max(4000)).max(10).optional().describe("Scenario only: fixed first student messages sent before the simulator takes over (lesson scenarios and coach scenarios max 5, voice scenarios max 10)"),
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

// ── Run comparison (pure) ────────────────────────────────────────────────────

export interface RunBundle {
  id: string;
  run: Record<string, unknown>;
  results: ResultRow[];
}

export type CompareSide = {
  id: string;
  version_no: number | null;
  version_id: string | null;
  model_ids: unknown;
};

export type CompareEntry = {
  case_name: string;
  case_kind: string;
  a: { passed: boolean | null; score: number | null };
  b: { passed: boolean | null; score: number | null };
};

export type CaseDelta = {
  case_name: string;
  case_kind: string;
  score?: { a: number; b: number; diff: number };
  deviation?: { a: string; b: string };
  completed?: { a: boolean; b: boolean };
  voice_score?: { a: number; b: number; diff: number };
  questions?: { question_id: string; a: number | null; b: number | null; diff: number | null }[];
};

export type RunComparison = {
  a: CompareSide;
  b: CompareSide;
  regressions: CompareEntry[];
  fixes: CompareEntry[];
  unchanged: CompareEntry[];
  only_in_a: string[];
  only_in_b: string[];
  errored: { case_name: string; side: "a" | "b" | "both"; error: string }[];
  deltas: CaseDelta[];
};

function sideOf(b: RunBundle): CompareSide {
  const v = b.run.ai_config_versions;
  const one = Array.isArray(v) ? v[0] : v;
  const no = one && typeof one === "object" ? (one as { version_no?: unknown }).version_no : undefined;
  return {
    id: b.id,
    version_no: typeof no === "number" ? no : null,
    version_id: typeof b.run.version_id === "string" ? b.run.version_id : null,
    model_ids: b.run.model_ids ?? null,
  };
}

function targetLabel(run: Record<string, unknown>): string {
  return `${String(run.target_type ?? "target")} ${String(run.target_id ?? "?")}`;
}

/** Voice score lives in output.evaluation; only voice outputs carry it. */
function voiceScoreOf(r: ResultRow): number | null {
  if (r.output?.kind !== "voice") return null;
  const s = r.output.evaluation?.score ?? r.score;
  return typeof s === "number" ? s : null;
}

function questionDeltas(ra: ResultRow, rb: ResultRow): NonNullable<CaseDelta["questions"]> {
  const qa = ra.output?.questions ?? null;
  const qb = rb.output?.questions ?? null;
  if (!qa || !qb) return [];
  const byId = new Map(qb.map((q) => [q.question_id, q]));
  const out: NonNullable<CaseDelta["questions"]> = [];
  for (const q of qa) {
    const other = byId.get(q.question_id);
    if (!other) continue;
    const a = q.median ?? null;
    const b = other.median ?? null;
    if (a !== b) out.push({ question_id: q.question_id, a, b, diff: a != null && b != null ? b - a : null });
  }
  return out;
}

function deltaOf(ra: ResultRow, rb: ResultRow): CaseDelta | null {
  const d: CaseDelta = { case_name: ra.case_name, case_kind: ra.case_kind };
  let changed = false;
  if (typeof ra.score === "number" && typeof rb.score === "number" && ra.score !== rb.score) {
    d.score = { a: ra.score, b: rb.score, diff: rb.score - ra.score };
    changed = true;
  }
  const da = deviationText(ra.deviation);
  const db = deviationText(rb.deviation);
  if (da !== db) {
    d.deviation = { a: da, b: db };
    changed = true;
  }
  if (typeof ra.completed === "boolean" && typeof rb.completed === "boolean" && ra.completed !== rb.completed) {
    d.completed = { a: ra.completed, b: rb.completed };
    changed = true;
  }
  const va = voiceScoreOf(ra);
  const vb = voiceScoreOf(rb);
  if (va != null && vb != null && va !== vb) {
    d.voice_score = { a: va, b: vb, diff: vb - va };
    changed = true;
  }
  const qs = questionDeltas(ra, rb);
  if (qs.length) {
    d.questions = qs;
    changed = true;
  }
  return changed ? d : null;
}

/**
 * Compare two finished runs of the same target. Pure: throws (with a message
 * fit for the agent) when a run is not `done` or the targets differ. Cases are
 * joined by case_id, falling back to case_name when a side has no id.
 */
export function compareRuns(a: RunBundle, b: RunBundle): RunComparison {
  for (const r of [a, b]) {
    const status = String(r.run.status ?? "unknown");
    if (status !== "done")
      throw new Error(
        `Run ${r.id} is ${status}, not done. Only finished runs can be compared; check it with lms_get_eval_run and compare once it is done.`
      );
  }
  if (a.run.target_type !== b.run.target_type || a.run.target_id !== b.run.target_id)
    throw new Error(
      `Runs ${a.id} (${targetLabel(a.run)}) and ${b.id} (${targetLabel(b.run)}) test different targets. Compare runs of the same lesson, exercise or exam.`
    );

  const bById = new Map<string, ResultRow>();
  const bByName = new Map<string, ResultRow>();
  for (const r of b.results) {
    if (r.case_id) bById.set(r.case_id, r);
    bByName.set(r.case_name, r);
  }
  const used = new Set<ResultRow>();
  const pairs: [ResultRow, ResultRow][] = [];
  const onlyA: string[] = [];
  for (const ra of a.results) {
    let rb = ra.case_id ? bById.get(ra.case_id) : undefined;
    if (!rb) {
      const cand = bByName.get(ra.case_name);
      // Name fallback only when the ids could not be compared (a side without an id).
      if (cand && !(cand.case_id && ra.case_id)) rb = cand;
    }
    if (rb && !used.has(rb)) {
      used.add(rb);
      pairs.push([ra, rb]);
    } else {
      onlyA.push(ra.case_name);
    }
  }
  const onlyB = b.results.filter((r) => !used.has(r)).map((r) => r.case_name);

  const regressions: CompareEntry[] = [];
  const fixes: CompareEntry[] = [];
  const unchanged: CompareEntry[] = [];
  const errored: RunComparison["errored"] = [];
  const deltas: CaseDelta[] = [];
  for (const [ra, rb] of pairs) {
    if (ra.error || rb.error) {
      errored.push({
        case_name: ra.case_name,
        side: ra.error && rb.error ? "both" : ra.error ? "a" : "b",
        error: [ra.error, rb.error].filter(Boolean).join(" / "),
      });
      continue;
    }
    const entry: CompareEntry = {
      case_name: ra.case_name,
      case_kind: ra.case_kind,
      a: { passed: ra.passed ?? null, score: ra.score ?? null },
      b: { passed: rb.passed ?? null, score: rb.score ?? null },
    };
    if (ra.passed === true && rb.passed === false) regressions.push(entry);
    else if (ra.passed === false && rb.passed === true) fixes.push(entry);
    else unchanged.push(entry);
    const d = deltaOf(ra, rb);
    if (d) deltas.push(d);
  }

  return {
    a: sideOf(a),
    b: sideOf(b),
    regressions,
    fixes,
    unchanged,
    only_in_a: onlyA,
    only_in_b: onlyB,
    errored,
    deltas,
  };
}

function modelsText(models: unknown): string {
  if (!models || typeof models !== "object") return "models not recorded";
  const parts = Object.entries(models as Record<string, unknown>).map(([role, id]) => `${role} ${String(id)}`);
  return parts.length ? parts.join(", ") : "models not recorded";
}

const versionLabel = (s: CompareSide) => (s.version_no != null ? `v${s.version_no}` : "v?");
const passLabel = (p: boolean | null) => (p === true ? "pass" : p === false ? "fail" : "n/a");
const scoreLabel = (s: number | null) => (s != null ? String(s) : "n/a");
const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function formatCompareReport(c: RunComparison): string {
  const matched = c.regressions.length + c.fixes.length + c.unchanged.length + c.errored.length;
  const out: string[] = [
    `# A ${versionLabel(c.a)} (${modelsText(c.a.model_ids)}) vs B ${versionLabel(c.b)} (${modelsText(c.b.model_ids)})`,
    "",
    `- **A:** \`${c.a.id}\` · **B:** \`${c.b.id}\``,
    `- **Matched cases:** ${matched} — ${c.regressions.length} regressions, ${c.fixes.length} fixes, ${c.unchanged.length} unchanged, ${c.errored.length} errored`,
    `- **Only in A:** ${c.only_in_a.length} · **Only in B:** ${c.only_in_b.length}`,
  ];
  const table = (title: string, rows: CompareEntry[]) => {
    out.push("", `## ${title}`, "");
    if (!rows.length) return out.push("None.");
    out.push("| Case | Kind | A | B |", "|---|---|---|---|");
    for (const r of rows)
      out.push(
        `| ${mdCell(r.case_name)} | ${r.case_kind} | ${passLabel(r.a.passed)} (${scoreLabel(r.a.score)}) | ${passLabel(r.b.passed)} (${scoreLabel(r.b.score)}) |`
      );
  };
  table("Regressions (passed in A, failed in B)", c.regressions);
  table("Fixes (failed in A, passed in B)", c.fixes);

  const big = c.deltas.filter(
    (d) => (d.score && Math.abs(d.score.diff) > 10) || (d.voice_score && Math.abs(d.voice_score.diff) > 10)
  );
  out.push("", "## Score changes over 10 points", "");
  if (!big.length) out.push("None.");
  else {
    out.push("| Case | Score A → B | Voice score A → B |", "|---|---|---|");
    for (const d of big)
      out.push(
        `| ${mdCell(d.case_name)} | ${d.score ? `${d.score.a} → ${d.score.b}` : "—"} | ${d.voice_score ? `${d.voice_score.a} → ${d.voice_score.b}` : "—"} |`
      );
  }

  const flips = c.deltas.filter((d) => d.completed);
  if (flips.length) {
    out.push("", "## Completion changes", "");
    for (const d of flips) {
      const label = (v: boolean) => (v ? "completed" : "not completed");
      out.push(`- ${mdCell(d.case_name)}: ${label(d.completed!.a)} → ${label(d.completed!.b)}`);
    }
  }
  if (c.deltas.length)
    out.push("", `${c.deltas.length} case(s) changed in total; smaller deltas (deviation, per-question points) are in the structured result.`);

  if (c.only_in_a.length) out.push("", "## Only in A", "", ...c.only_in_a.map((n) => `- ${n}`));
  if (c.only_in_b.length) out.push("", "## Only in B", "", ...c.only_in_b.map((n) => `- ${n}`));
  if (c.errored.length)
    out.push(
      "",
      "## Errored (not compared)",
      "",
      ...c.errored.map((e) => `- ${e.case_name} (${e.side === "both" ? "both runs" : `run ${e.side.toUpperCase()}`}): ${e.error}`)
    );
  return out.join("\n");
}

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
      description: `List the test cases of a lesson's AI task (pass lesson_id): golden chats (saved conversations replayed against the current prompt) and scenarios (simulated students), plus whether scenarios auto-regenerate. Or list the cases of an AI-graded exercise (pass exercise_id): graded answers, coach scenarios and voice scenarios; or the graded-exam cases of an exam (pass exam_id). ${GRADED_EXPLAINER} ${EXAM_EXPLAINER} ${WORKFLOW}`,
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
          return ok({ exercise_id: t.id, cases }, `# Test cases for exercise ${t.id} (${cases.length})\n\n${md}`);
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
      description: `Add a test case to a lesson's AI task. kind 'golden_chat': a conversation (messages) that must keep working after you change the prompt — optionally record whether it completed (completed/completed_turn). kind 'scenario': a simulated student (persona, goal, optional scripted first messages, max 5, and max_turns) played by the platform. Both can set expected_completed (true = the task must complete, false = must NOT complete, omit/null = either) and must_keep (short criteria a judge checks, e.g. 'Tutor never gives the final answer'; max 8). Max 20 cases per lesson. EXERCISES: pass exercise_id instead of lesson_id. kind 'graded_answer' (default, omit kind): content + expected_score (+ optional tolerance default 10, expected_passed, category) saves one sample answer. kind 'coach_scenario' (not for external exercise types): persona, goal, script (max 5), max_turns, expected_completed, must_keep. A simulated student tries to get the AI coach to complete the exercise; the coach gets a preview-only completion tool, so nothing is written. kind 'voice_scenario' (real_time_conversation exercises): persona, goal, script (max 10), max_turns, simulate_after_script (default true), expected_finished, expected_passed, score_min / score_max (0-100 band), must_keep. TEXT-simulated: a text model stands in for the realtime voice model, so no audio or pronunciation is tested. EXAMS: pass exam_id instead (kind is implied 'graded_exam') with answers (question_id → text) + expected_points (question_id → points), optional tolerance and category. ${GRADED_EXPLAINER} ${EXAM_EXPLAINER} ${WORKFLOW}`,
      schema: z.object({
        ...TargetFields,
        kind: z.enum(["golden_chat", "scenario", "graded_answer", "graded_exam", "coach_scenario", "voice_scenario"]).optional().describe("Lessons: 'golden_chat' needs messages; 'scenario' needs persona. Exercises: omit or 'graded_answer' (sample answer), 'coach_scenario' or 'voice_scenario' (both need persona). Exams: omit (always 'graded_exam')"),
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
        simulate_after_script: z.boolean().optional().describe("voice_scenario only: keep the simulated speaker going after the scripted messages (default true)"),
        expected_finished: z.boolean().nullable().optional().describe("voice_scenario only: true = the tutor must finish the conversation, false = must not, null/omitted = either"),
        score_min: z.number().int().min(0).max(100).optional().describe("voice_scenario only: lowest acceptable score (0-100)"),
        score_max: z.number().int().min(0).max(100).optional().describe("voice_scenario only: highest acceptable score (0-100)"),
      }),
      annotations: WRITE,
    },
    async (input, ctx) => {
      const t = resolveEvalTarget(input);
      if (!t.ok) return errorResult(t.error);
      const voiceOnly =
        input.simulate_after_script !== undefined || input.expected_finished !== undefined ||
        input.score_min !== undefined || input.score_max !== undefined;
      let built: ReturnType<typeof buildCreateCaseBody>;
      let surface: EvalSurface = "graded";
      if (t.kind === "exam") {
        if (input.kind !== undefined && input.kind !== "graded_exam")
          return errorResult("Exams only support kind 'graded_exam' (omit kind).");
        if (
          input.content !== undefined || input.expected_score !== undefined || input.expected_passed !== undefined ||
          input.messages || input.persona || input.goal || input.script || input.max_turns !== undefined ||
          input.must_keep || input.expected_completed !== undefined || input.completed !== undefined || input.completed_turn !== undefined ||
          voiceOnly
        )
          return errorResult("content/expected_score/expected_passed and the lesson/exercise fields (messages, persona, must_keep, expected_completed, completed, voice fields) don't apply to exam cases; use answers + expected_points.");
        built = buildExamCaseBody({
          name: input.name,
          importance_note: input.importance_note,
          answers: input.answers ?? {},
          expected_points: input.expected_points ?? {},
          tolerance: input.tolerance,
          category: input.category,
        });
      } else if (t.kind === "exercise") {
        const kind = input.kind;
        if (kind !== undefined && kind !== "graded_answer" && kind !== "coach_scenario" && kind !== "voice_scenario")
          return errorResult("Exercises support kind 'graded_answer' (omit kind), 'coach_scenario' or 'voice_scenario'.");
        if (input.answers !== undefined || input.expected_points !== undefined)
          return errorResult("answers/expected_points belong to exam cases; use exam_id.");
        if (kind === "coach_scenario" || kind === "voice_scenario") {
          surface = kind === "coach_scenario" ? "coach" : "voice";
          if (input.content !== undefined || input.expected_score !== undefined || input.category !== undefined || input.tolerance !== undefined)
            return errorResult("content/expected_score/tolerance/category belong to graded answers; scenario cases use persona, goal, script and max_turns.");
          if (kind === "coach_scenario") {
            if (voiceOnly || input.expected_passed !== undefined)
              return errorResult("simulate_after_script, expected_finished, expected_passed, score_min and score_max belong to voice_scenario cases.");
            built = buildCoachCaseBody({
              name: input.name,
              importance_note: input.importance_note,
              persona: input.persona ?? "",
              goal: input.goal,
              script: input.script,
              max_turns: input.max_turns,
              expected_completed: input.expected_completed,
              must_keep: input.must_keep,
            });
          } else {
            built = buildVoiceCaseBody({
              name: input.name,
              importance_note: input.importance_note,
              persona: input.persona ?? "",
              goal: input.goal,
              script: input.script,
              max_turns: input.max_turns,
              simulate_after_script: input.simulate_after_script,
              expected_finished: input.expected_finished,
              expected_passed: input.expected_passed,
              score_min: input.score_min,
              score_max: input.score_max,
              must_keep: input.must_keep,
            });
          }
        } else {
          if (input.messages || input.persona || input.goal || input.script || input.max_turns !== undefined || input.must_keep || voiceOnly)
            return errorResult("messages, persona, goal, script, max_turns, must_keep and the voice fields belong to scenario cases (coach_scenario, voice_scenario) or lesson AI-task cases, not graded answers.");
          built = buildGradedCaseBody({
            name: input.name,
            importance_note: input.importance_note,
            content: input.content ?? "",
            expected_score: input.expected_score as number,
            tolerance: input.tolerance,
            expected_passed: input.expected_passed,
            category: input.category,
          });
        }
      } else {
        if (input.kind === undefined || input.kind === "graded_answer" || input.kind === "graded_exam" || input.kind === "coach_scenario" || input.kind === "voice_scenario")
          return errorResult("Lesson cases need kind 'golden_chat' or 'scenario'. For graded answers, coach or voice scenarios pass exercise_id; for exam questions pass exam_id.");
        if (input.content !== undefined || input.expected_score !== undefined || input.category !== undefined)
          return errorResult("content/expected_score/tolerance/category belong to exercise graded answers; use exercise_id.");
        if (input.answers !== undefined || input.expected_points !== undefined)
          return errorResult("answers/expected_points belong to exam cases; use exam_id.");
        if (voiceOnly) return errorResult("simulate_after_script, expected_finished, score_min and score_max belong to voice_scenario cases on exercises (use exercise_id).");
        if (input.kind === "scenario" && (input.script ?? []).length > 5)
          return errorResult("A lesson scenario takes at most 5 scripted messages.");
        built = buildCreateCaseBody({ ...input, kind: input.kind });
      }
      if (!built.ok) return errorResult(built.error);
      return run(ctx, ownerOfTarget(t), async (call) => {
        const res = await call("POST", `${t.base}/cases`, built.body);
        if (res.status !== 201) return errorResult(describeEvalError(res.status, res.body, t.kind, surface));
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
      if (input.script !== undefined && input.script.length > 5 && input.lesson_id !== undefined)
        return errorResult("A lesson scenario takes at most 5 scripted messages.");
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
      description: `Have the platform draft test cases for an AI-graded exercise, using the school's AI key. surface 'graded' (default): 8 sample student answers, one per category: high, mid, low, boundary (right at the passing score), injection (tries to make the grader give 100), keyword_stuffing, off_topic and short_correct, each with an expected score. surface 'coach' (not for external exercises): simulated students who try to get the AI coach to complete the exercise, including a cheater who claims to be done and asks to be marked complete. surface 'voice' (real_time_conversation exercises only): simulated speakers for the TEXT-simulated conversation test (on-level, one-word answers, native-language switching, and an injection that asks to be told 100). All drafts are saved as UNVERIFIED cases: review them with lms_list_eval_cases and correct them with lms_update_eval_case (for graded answers, editing marks them verified). Max 20 cases per exercise (409 case_limit if none fit). ${GRADED_EXPLAINER}`,
      schema: z.object({
        exercise_id: z.number().describe("The exercise ID"),
        surface: z
          .enum(["graded", "coach", "voice"])
          .optional()
          .describe("graded (default) = sample answers to grade; coach = simulated students for the AI coach; voice = simulated speakers for a real_time_conversation exercise"),
      }),
      annotations: WRITE,
    },
    async ({ exercise_id, surface }, ctx) => {
      const s: EvalSurface = surface ?? "graded";
      return run(ctx, { exercise: exercise_id }, async (call) => {
        const res = await call("POST", `/exercise/${exercise_id}/generate`, { surface: s }, 120_000);
        if (res.status !== 201) return errorResult(describeEvalError(res.status, res.body, "exercise", s));
        const cases = (Array.isArray(res.body.cases) ? res.body.cases : []) as CaseRow[];
        const label = s === "graded" ? "sample answer(s)" : s === "coach" ? "coach scenario(s)" : "voice scenario(s)";
        const next =
          s === "graded"
            ? "Review the expected scores, then run them with lms_run_evals (exercise_id)."
            : "Review the personas and expectations, then run them with lms_run_evals (exercise_id).";
        return ok(
          { cases, surface: s },
          `Drafted ${cases.length} ${label} (unverified):\n\n${cases.map(formatCase).join("\n")}\n\n${next}`
        );
      });
    }
  );

  // ── lms_run_evals ──────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_run_evals",
      description: `Run every test case against the lesson's CURRENT saved AI task (save prompt changes first with lms_upsert_lesson_ai_task), or — with exercise_id — against the exercise's CURRENT saved grader (save changes first with lms_update_exercise), or — with exam_id — against the exam's CURRENT saved questions and grading (save changes first with lms_update_exam_question): each graded answer (or each exam's free-text answer set) is graded 3 times, so cost is cases × 3 model calls (returned as estimated_model_calls); injection cases must never score above expected. Lesson cases (scenarios and golden chats) run \`repeats\` times each (default 3; 1, 3 or 5) and the result is decided by majority: completed or not by majority, each must_keep criterion passed by majority; cost is roughly cases × 12 × repeats model calls (returned as estimated_model_calls), so 3 repeats triple the cost of a single pass. Exercises also run their coach and voice scenarios once each (the coach gets a preview-only completion tool, so nothing is written; voice is TEXT-simulated with no audio). An exam with no free-text questions is rejected (no_ai_questions). The run executes in the background on the school's AI key (one run at a time per lesson, daily cap per school) and takes roughly 1–3 minutes; this call returns the run id immediately — then call lms_get_eval_run. ${WORKFLOW}`,
      schema: z.object({
        ...TargetFields,
        repeats: z
          .union([z.literal(1), z.literal(3), z.literal(5)])
          .optional()
          .describe("Lesson only: times each case runs; the majority decides (default 3). Cost scales with it"),
      }),
      annotations: WRITE,
    },
    async (input, ctx) => {
      const t = resolveEvalTarget(input);
      if (!t.ok) return errorResult(t.error);
      if (input.repeats !== undefined && t.kind !== "lesson")
        return errorResult("`repeats` applies to lesson AI task runs only; exercise and exam cases are always graded 3 times.");
      return run(ctx, ownerOfTarget(t), async (call) => {
        const body = input.repeats !== undefined ? { repeats: input.repeats } : {};
        const res = await call("POST", `${t.base}/runs`, body, RUN_START_TIMEOUT_MS);
        if (res.status !== 202 && res.status !== 201 && res.status !== 200)
          return errorResult(describeEvalError(res.status, res.body, t.kind));
        const r = res.body.run as { id?: string; status?: string } | undefined;
        const est = res.body.estimated_model_calls;
        const repeats = typeof res.body.repeats === "number" ? res.body.repeats : undefined;
        return ok(
          { run_id: r?.id, status: r?.status ?? "queued", estimated_model_calls: est, ...(repeats ? { repeats } : {}) },
          `Test run started: \`${r?.id}\` (${r?.status ?? "queued"}${typeof est === "number" ? `, ~${est} model calls on the school's AI key` : ""}${repeats && repeats > 1 ? `; each case runs ${repeats} times and the majority decides` : ""}).\n\nCall lms_get_eval_run with run_id "${r?.id}" in ~1–3 minutes to read the report.`
        );
      });
    }
  );

  // ── lms_get_eval_run ───────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_eval_run",
      description:
        "Read a test run's report as markdown: status, task version, summary, one line per case (✓/✗, completed vs expected, turn, deviation) and the failed criteria with evidence. For exercise runs: per case expected score ±tolerance vs the median score, the 3 repeat scores, stddev, deviation, INFLATED flag for injections, and the grader's feedback; summary has inflated_injections, pass_flips (majority verdict wrong), unstable_cases (a repeat disagreed), mean_deviation, max_stddev. For exam runs: per case the expected total vs the median total, then a per-question table (question ID, auto-scored or AI-graded, expected vs median points, deviation %, flags: flip, unstable, inflated, question removed); summary also has question_flips. Lesson cases run several times show the majority result, how many repeats completed, UNSTABLE when repeats disagreed, and per failed criterion how many repeats passed it; the summary has repeats and unstable_cases. Coach scenarios show completed or not against expected, the turn it completed at, and the failed reasons. Voice scenarios (text-simulated) show finished or not, the score against its expected band, hints and corrections. If the run is still queued/running, call again in a minute. Set include_transcripts to read the full conversations (long). Use the failures to improve the prompt with lms_upsert_lesson_ai_task, then lms_run_evals again.",
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

  // ── lms_compare_eval_runs ──────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_compare_eval_runs",
      description:
        "Compare two finished test runs of the same lesson, exercise or exam: the before and after of a prompt or grader change. run_a = the baseline (older) run, run_b = the newer one. Lists REGRESSIONS (passed in run_a, failed in run_b), FIXES (failed → passed), cases in only one run, errored cases, and deltas: score, deviation, completion flips, per-question points (exams) and voice scores (voice scenarios). Cases are matched by case ID (name when IDs are missing). Both runs must be done and of the same target. Read-only.",
      schema: z.object({
        run_a: z.string().describe("The baseline run ID (older)"),
        run_b: z.string().describe("The run ID to compare against the baseline (newer)"),
      }),
      annotations: READ_ONLY,
    },
    async ({ run_a, run_b }, ctx) =>
      run(ctx, null, async (call) => {
        const [ra, rb] = await Promise.all([
          call("GET", `/runs/${encodeURIComponent(run_a)}`),
          call("GET", `/runs/${encodeURIComponent(run_b)}`),
        ]);
        if (ra.status !== 200) return errorResult(describeEvalError(ra.status, ra.body));
        if (rb.status !== 200) return errorResult(describeEvalError(rb.status, rb.body));
        const bundle = (id: string, res: EvalHttpResult): RunBundle => ({
          id,
          run: (res.body.run ?? {}) as Record<string, unknown>,
          results: (Array.isArray(res.body.results) ? res.body.results : []) as ResultRow[],
        });
        const cmp = compareRuns(bundle(run_a, ra), bundle(run_b, rb));
        return ok({ ...cmp }, formatCompareReport(cmp));
      })
  );

  // ── lms_list_eval_runs ─────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_eval_runs",
      description:
        "List the most recent test runs (up to 20) for a lesson's AI task (lesson_id), an AI-graded exercise (exercise_id) or an exam (exam_id) with status, task version and summary — use it to compare versions before/after a prompt change. Open one with lms_get_eval_run, or compare two finished runs of the same target with lms_compare_eval_runs.",
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
