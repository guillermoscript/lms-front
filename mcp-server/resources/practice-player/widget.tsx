import { useMemo, useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const questionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "multiple_choice",
    "true_false",
    "fill_blank",
    "match",
    "order",
    "free_text",
  ]),
  prompt: z.string(),
  // Mixed (interleaved) sessions: which topic this question drills (#393).
  topic: z.string().optional(),
  // Explanatory feedback shown after grading (#391); optional for older payloads.
  explanation: z.string().optional(),
  options: z.array(z.string()).optional(),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).optional(),
  sequence: z.array(z.string()).optional(),
  correct: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
});

const propsSchema = z.object({
  topic: z.string(),
  // mixed = interleaved session across mastery-gated topics (#393); shows the
  // expectation-setting banner and per-question topic in the header pill.
  mode: z.enum(["focused", "mixed"]).optional(),
  course_id: z.number().nullable(),
  lesson_id: z.number().nullable(),
  source_exercise_id: z.number().nullable(),
  questions: z.array(questionSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Interactive practice quiz: the student answers question by question; closed types are graded locally and the attempt is recorded, free-text answers go back to the host to grade",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Setting up practice…",
    invoked: "Practice quiz ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Question = z.infer<typeof questionSchema>;

// Answer shapes per type: mc → option index, tf → boolean, fill/free → string,
// match → right-item per left-item, order → arranged items.
type Answer = number | boolean | string | Record<string, string> | string[];

// ── Grading (closed types only) ─────────────────────────────────────────────

function isCorrect(q: Question, answer: Answer | undefined): boolean | null {
  if (q.type === "free_text") return null;
  if (answer === undefined) return false;
  switch (q.type) {
    case "multiple_choice":
      return answer === q.correct;
    case "true_false":
      return answer === q.correct;
    case "fill_blank": {
      const given = String(answer).trim().toLowerCase();
      const accepted = Array.isArray(q.correct)
        ? q.correct
        : [String(q.correct ?? "")];
      return accepted.some((a) => a.trim().toLowerCase() === given);
    }
    case "match": {
      const map = answer as Record<string, string>;
      return (q.pairs ?? []).every((p) => map[p.left] === p.right);
    }
    case "order": {
      const arranged = answer as string[];
      const target = q.sequence ?? [];
      return (
        arranged.length === target.length &&
        arranged.every((item, i) => item === target[i])
      );
    }
  }
}

function expectedAnswerText(q: Question): string {
  switch (q.type) {
    case "multiple_choice":
      return q.options?.[q.correct as number] ?? "";
    case "true_false":
      return q.correct ? "True" : "False";
    case "fill_blank":
      return Array.isArray(q.correct) ? q.correct[0] : String(q.correct ?? "");
    case "match":
      return (q.pairs ?? []).map((p) => `${p.left} → ${p.right}`).join(", ");
    case "order":
      return (q.sequence ?? []).join(" → ");
    case "free_text":
      return "";
  }
}

function answerText(q: Question, answer: Answer | undefined): string {
  if (answer === undefined) return "(no answer)";
  switch (q.type) {
    case "multiple_choice":
      return q.options?.[answer as number] ?? String(answer);
    case "true_false":
      return answer ? "True" : "False";
    case "match":
      return Object.entries(answer as Record<string, string>)
        .map(([l, r]) => `${l} → ${r}`)
        .join(", ");
    case "order":
      return (answer as string[]).join(" → ");
    default:
      return String(answer);
  }
}

// mcp-server widgets have no i18n layer; the mixed-practice explainer is the
// one string the issue (#393) requires in en/es, so pick by browser locale.
const IS_ES =
  typeof navigator !== "undefined" &&
  (navigator.language || "").toLowerCase().startsWith("es");

const MIXED_COPY = IS_ES
  ? {
      pill: "Práctica mixta",
      banner:
        "Práctica mezclada: las preguntas saltan entre temas a propósito. Se siente más difícil — esa es la idea: mejora de forma comprobada la retención a largo plazo.",
    }
  : {
      pill: "Mixed practice",
      banner:
        "Mixed practice: questions jump between topics on purpose. It feels harder — that's the point: it measurably improves long-term retention.",
    };

/** Deterministic-enough shuffle for presentation (never mutates the input). */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // A shuffle that lands on the original order defeats `order` questions.
  if (out.length > 1 && out.every((v, i) => v === items[i])) {
    [out[0], out[1]] = [out[1], out[0]];
  }
  return out;
}

// ── Shared class helpers ─────────────────────────────────────────────────────

const containerClass =
  "mx-auto max-w-[680px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950";

/** Choice/option button. `layout` lets true/false + match variants override
 *  the default block/full-width/left-aligned shape without class conflicts. */
const choiceClass = (selected: boolean, layout = "block w-full text-left") =>
  `mb-2 cursor-pointer rounded-[10px] border-[1.5px] px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 ${layout} ${
    selected
      ? "border-violet-600 bg-violet-50 font-semibold dark:border-violet-400 dark:bg-violet-950"
      : "border-zinc-200 bg-white font-normal dark:border-zinc-800 dark:bg-zinc-900"
  }`;

const primaryBtnClass =
  "cursor-pointer rounded-[10px] border-none bg-violet-600 px-4.5 py-[9px] text-[13.5px] font-semibold text-white dark:bg-violet-400";

const inputClass =
  "box-border w-full rounded-[10px] border-[1.5px] border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";

// ── Component ────────────────────────────────────────────────────────────────

export default function PracticePlayer() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const { callTool: recordAttempt, isPending: isRecording } = useCallTool(
    "lms_record_practice_attempt"
  );

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [phase, setPhase] = useState<"quiz" | "results">("quiz");
  const [handedOff, setHandedOff] = useState(false);
  // match: which left item is awaiting a right-side pick
  const [pendingLeft, setPendingLeft] = useState<string | null>(null);

  const dark = theme === "dark";

  const shuffledRights = useMemo(
    () =>
      Object.fromEntries(
        (props?.questions ?? [])
          .filter((q) => q.type === "match")
          .map((q) => [q.id, shuffled((q.pairs ?? []).map((p) => p.right))])
      ),
    [props?.questions]
  );
  const initialOrders = useMemo(
    () =>
      Object.fromEntries(
        (props?.questions ?? [])
          .filter((q) => q.type === "order")
          .map((q) => [q.id, shuffled(q.sequence ?? [])])
      ),
    [props?.questions]
  );

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            Setting up practice…
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { topic, questions } = props;

  if (questions.length === 0) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-sm text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            No practice questions could be generated for “{topic}”. Ask the
            tutor to try a different topic or lesson.
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const isMixed = props.mode === "mixed";
  const q = questions[index];
  const answer = answers[q?.id];
  const hasFreeText = questions.some((x) => x.type === "free_text");
  const isLast = index === questions.length - 1;

  const answeredCurrent = (() => {
    if (!q) return false;
    if (q.type === "match") {
      const map = (answer as Record<string, string>) ?? {};
      return (q.pairs ?? []).every((p) => map[p.left] !== undefined);
    }
    if (q.type === "order") return true; // an arrangement always exists
    if (q.type === "fill_blank" || q.type === "free_text")
      return typeof answer === "string" && answer.trim().length > 0;
    return answer !== undefined;
  })();

  const setAnswer = (value: Answer) =>
    setAnswers((prev) => ({ ...prev, [q.id]: value }));

  // order questions default to their presented arrangement — setAnswers on the
  // final Next click hasn't flushed by the time finish() runs.
  const effectiveAnswer = (x: Question): Answer | undefined =>
    answers[x.id] ?? (x.type === "order" ? initialOrders[x.id] : undefined);

  const finish = () => {
    setPhase("results");
    const closed = questions.filter((x) => x.type !== "free_text");
    const results = questions.map((x) => ({
      id: x.id,
      prompt: x.prompt,
      type: x.type,
      ...(x.topic ? { topic: x.topic } : {}),
      answer: answerText(x, effectiveAnswer(x)),
      correct: isCorrect(x, effectiveAnswer(x)),
    }));

    if (hasFreeText) {
      // Host grades: hand everything back, host records the attempt itself.
      if (!handedOff) {
        setHandedOff(true);
        const topicTag = (r: { topic?: string }) =>
          isMixed && r.topic ? ` [topic: ${r.topic}]` : "";
        const closedSummary = results
          .filter((r) => r.correct !== null)
          .map((r) => `- [${r.correct ? "correct" : "wrong"}]${topicTag(r)} ${r.prompt} — my answer: ${r.answer}`)
          .join("\n");
        const freeSummary = results
          .filter((r) => r.correct === null)
          .map((r) => `-${topicTag(r)} ${r.prompt}\n  My answer: ${r.answer}`)
          .join("\n");
        sendFollowUpMessage(
          `I finished the ${isMixed ? "mixed (interleaved) " : ""}practice quiz on "${topic}".\n\nWidget-graded questions (${closed.filter((x) => isCorrect(x, effectiveAnswer(x))).length}/${closed.length} correct):\n${closedSummary || "(none)"}\n\nFree-text answers for you to grade:\n${freeSummary}\n\nGrade my free-text answers, compute the overall score, record it with lms_record_practice_attempt${isMixed ? " (mode 'mixed', keep each question's topic tag so per-topic attribution survives)" : ""}${props.source_exercise_id ? ` (source_exercise_id ${props.source_exercise_id})` : ""}${props.lesson_id ? ` (lesson_id ${props.lesson_id})` : props.course_id ? ` (course_id ${props.course_id})` : ""}, then reteach anything I got wrong.`
        );
      }
      return;
    }

    // Fully closed quiz: grade locally, record, then hand back to the host.
    const correctCount = closed.filter((x) =>
      isCorrect(x, effectiveAnswer(x))
    ).length;
    const score = closed.length
      ? Math.round((correctCount / closed.length) * 100)
      : 0;
    const missed = results.filter((r) => r.correct === false);

    recordAttempt(
      {
        topic,
        ...(isMixed ? { mode: "mixed" as const } : {}),
        ...(props.course_id !== null ? { course_id: props.course_id } : {}),
        ...(props.lesson_id !== null ? { lesson_id: props.lesson_id } : {}),
        ...(props.source_exercise_id !== null
          ? { source_exercise_id: props.source_exercise_id }
          : {}),
        questions: questions as unknown as Array<Record<string, unknown>>,
        answers: results as unknown as Array<Record<string, unknown>>,
        score,
        total_questions: closed.length,
        correct_count: correctCount,
      },
      {
        onSettled: () => {
          if (handedOff) return;
          setHandedOff(true);
          sendFollowUpMessage(
            missed.length === 0
              ? `I scored ${correctCount}/${closed.length} on the "${topic}" practice quiz — all correct! Suggest what to practice next${props.source_exercise_id ? `, or whether I'm ready to complete the real exercise (id ${props.source_exercise_id})` : ""}.`
              : `I scored ${correctCount}/${closed.length} on the "${topic}" practice quiz. I missed:\n${missed.map((m) => `- ${m.prompt} (I answered: ${m.answer})`).join("\n")}\n\nReteach me what I got wrong, then quiz me again${props.source_exercise_id ? ` (keep source_exercise_id ${props.source_exercise_id})` : ""}.`
          );
        },
      }
    );
  };

  // ── Results screen ─────────────────────────────────────────────────────────
  if (phase === "results") {
    const results = questions.map((x) => ({
      q: x,
      correct: isCorrect(x, effectiveAnswer(x)),
    }));
    const closedTotal = results.filter((r) => r.correct !== null).length;
    const correctCount = results.filter((r) => r.correct === true).length;

    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className={containerClass}>
            <h2 className="m-0 mb-1 text-xl text-zinc-900 dark:text-zinc-100">
              {hasFreeText ? "Answers sent" : `${correctCount}/${closedTotal} correct`}
            </h2>
            <p className="m-0 mb-4 text-[13px] text-zinc-500 dark:text-zinc-400">
              {topic}
              {hasFreeText
                ? " — your free-text answers went to the tutor for grading."
                : isRecording
                  ? " — recording your attempt…"
                  : " — attempt recorded. The tutor will pick it up from here."}
            </p>
            {results.map(({ q: rq, correct }) => (
              <div
                key={rq.id}
                className={`mb-2 rounded-[10px] border border-zinc-200 px-3.5 py-2.5 text-[13.5px] dark:border-zinc-800 ${
                  correct === null
                    ? "bg-white dark:bg-zinc-900"
                    : correct
                      ? "bg-green-100 dark:bg-green-900"
                      : "bg-red-50 dark:bg-red-950"
                }`}
              >
                <div className="mb-1 font-semibold text-zinc-900 dark:text-zinc-100">
                  {correct === null ? "✍️" : correct ? "✓" : "✗"} {rq.prompt}
                </div>
                <div className="text-zinc-500 dark:text-zinc-400">
                  Your answer: {answerText(rq, effectiveAnswer(rq))}
                  {correct === false && (
                    <> · Correct: {expectedAnswerText(rq)}</>
                  )}
                  {correct === null && <> · Awaiting tutor grading</>}
                </div>
                {correct !== null && rq.explanation && (
                  <div className="mt-1 text-[12.5px] leading-[1.5] text-zinc-600 dark:text-zinc-300">
                    💡 {rq.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </McpUseProvider>
    );
  }

  // ── Question screen ────────────────────────────────────────────────────────
  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className={containerClass}>
          {/* Header + progress dots */}
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-lg bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:bg-violet-950 dark:text-violet-400">
              {isMixed
                ? `${MIXED_COPY.pill} · ${q.topic ?? topic}`
                : `Practice · ${topic}`}
            </span>
            <div
              className="flex gap-[5px]"
              aria-label={`Question ${index + 1} of ${questions.length}`}
            >
              {questions.map((dot, i) => (
                <span
                  key={dot.id}
                  className={`size-2 rounded-full ${
                    i === index
                      ? "bg-violet-600 dark:bg-violet-400"
                      : answers[dot.id] !== undefined
                        ? "bg-green-600 dark:bg-green-400"
                        : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              ))}
            </div>
          </div>

          {isMixed && index === 0 && (
            <p className="m-0 mb-3.5 rounded-[10px] border border-violet-200 bg-violet-50 px-3 py-2 text-[12.5px] leading-[1.5] text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
              {MIXED_COPY.banner}
            </p>
          )}

          <h2 className="m-0 mb-3.5 text-[17px] leading-[1.4] font-semibold text-zinc-900 dark:text-zinc-100">
            {index + 1}. {q.prompt}
          </h2>

          {/* Per-type input */}
          {q.type === "multiple_choice" &&
            (q.options ?? []).map((opt, i) => (
              <button key={i} onClick={() => setAnswer(i)} className={choiceClass(answer === i)}>
                {opt}
              </button>
            ))}

          {q.type === "true_false" && (
            <div className="flex gap-2.5">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setAnswer(v)}
                  className={choiceClass(answer === v, "flex-1 text-center")}
                >
                  {v ? "True" : "False"}
                </button>
              ))}
            </div>
          )}

          {(q.type === "fill_blank" || q.type === "free_text") && (
            q.type === "free_text" ? (
              <textarea
                value={(answer as string) ?? ""}
                onChange={(e) => setAnswer(e.target.value)}
                rows={5}
                placeholder="Write your answer — the tutor will grade it"
                className={`${inputClass} resize-y [font-family:inherit]`}
              />
            ) : (
              <input
                type="text"
                value={(answer as string) ?? ""}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer"
                className={inputClass}
              />
            )
          )}

          {q.type === "match" && (
            <div>
              <p className="m-0 mb-2 text-xs text-zinc-400 dark:text-zinc-500">
                Tap an item on the left, then its match on the right.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  {(q.pairs ?? []).map((p) => {
                    const matched = ((answer as Record<string, string>) ?? {})[p.left];
                    const border =
                      pendingLeft === p.left
                        ? "border-violet-600 bg-violet-50 font-semibold dark:border-violet-400 dark:bg-violet-950"
                        : matched
                          ? "border-green-600 bg-white font-normal dark:border-green-400 dark:bg-zinc-900"
                          : "border-zinc-200 bg-white font-normal dark:border-zinc-800 dark:bg-zinc-900";
                    return (
                      <button
                        key={p.left}
                        onClick={() => setPendingLeft(p.left)}
                        className={`mb-2 block w-full cursor-pointer rounded-[10px] border-[1.5px] px-3.5 py-2.5 text-left text-sm text-zinc-900 dark:text-zinc-100 ${border}`}
                      >
                        {p.left}
                        {matched && (
                          <span className="font-normal text-zinc-400 dark:text-zinc-500">
                            {" "}→ {matched}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex-1">
                  {(shuffledRights[q.id] ?? []).map((right) => (
                    <button
                      key={right}
                      onClick={() => {
                        if (!pendingLeft) return;
                        setAnswer({
                          ...(((answer as Record<string, string>) ?? {})),
                          [pendingLeft]: right,
                        });
                        setPendingLeft(null);
                      }}
                      disabled={!pendingLeft}
                      className={`${choiceClass(false)} disabled:cursor-default disabled:opacity-60`}
                    >
                      {right}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {q.type === "order" && (
            <div>
              <p className="m-0 mb-2 text-xs text-zinc-400 dark:text-zinc-500">
                Arrange with the ↑ / ↓ buttons.
              </p>
              {(((answer as string[]) ?? initialOrders[q.id]) ?? []).map(
                (item, i, arr) => (
                  <div
                    key={item}
                    className="mb-1.5 flex items-center gap-2 rounded-[10px] border-[1.5px] border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <span className="flex-1">{item}</span>
                    <button
                      aria-label={`Move "${item}" up`}
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...arr];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        setAnswer(next);
                      }}
                      className="cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 px-[9px] py-1 text-zinc-900 disabled:cursor-default disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move "${item}" down`}
                      disabled={i === arr.length - 1}
                      onClick={() => {
                        const next = [...arr];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        setAnswer(next);
                      }}
                      className="cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 px-[9px] py-1 text-zinc-900 disabled:cursor-default disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      ↓
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Nav */}
          <div className="mt-4.5 flex justify-between">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="cursor-pointer rounded-[10px] border border-zinc-200 bg-transparent px-4.5 py-[9px] text-[13.5px] font-semibold text-zinc-500 disabled:cursor-default disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-400"
            >
              Back
            </button>
            <button
              onClick={() => {
                // order questions default to the presented arrangement
                if (q.type === "order" && answers[q.id] === undefined) {
                  setAnswer(initialOrders[q.id] ?? []);
                }
                if (isLast) finish();
                else setIndex((i) => i + 1);
              }}
              disabled={!answeredCurrent}
              className={`${primaryBtnClass} disabled:cursor-default disabled:opacity-50`}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
