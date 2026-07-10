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
  options: z.array(z.string()).optional(),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).optional(),
  sequence: z.array(z.string()).optional(),
  correct: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
});

const propsSchema = z.object({
  topic: z.string(),
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
  const colors = {
    bg: dark ? "#0f0f0f" : "#fafafa",
    surface: dark ? "#1a1a1a" : "#ffffff",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    text: dark ? "#f4f4f5" : "#111827",
    textSecondary: dark ? "#a1a1aa" : "#6b7280",
    textMuted: dark ? "#71717a" : "#9ca3af",
    accent: dark ? "#a78bfa" : "#7c3aed",
    accentBg: dark ? "#2e1065" : "#f5f3ff",
    done: dark ? "#4ade80" : "#16a34a",
    doneBg: dark ? "#14532d" : "#dcfce7",
    wrong: dark ? "#fca5a5" : "#b91c1c",
    wrongBg: dark ? "#450a0a" : "#fef2f2",
    inputBg: dark ? "#141414" : "#ffffff",
  };

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
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: colors.textMuted,
            backgroundColor: colors.bg,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Setting up practice…
        </div>
      </McpUseProvider>
    );
  }

  const { topic, questions } = props;
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
      answer: answerText(x, effectiveAnswer(x)),
      correct: isCorrect(x, effectiveAnswer(x)),
    }));

    if (hasFreeText) {
      // Host grades: hand everything back, host records the attempt itself.
      if (!handedOff) {
        setHandedOff(true);
        const closedSummary = results
          .filter((r) => r.correct !== null)
          .map((r) => `- [${r.correct ? "correct" : "wrong"}] ${r.prompt} — my answer: ${r.answer}`)
          .join("\n");
        const freeSummary = results
          .filter((r) => r.correct === null)
          .map((r) => `- ${r.prompt}\n  My answer: ${r.answer}`)
          .join("\n");
        sendFollowUpMessage(
          `I finished the practice quiz on "${topic}".\n\nWidget-graded questions (${closed.filter((x) => isCorrect(x, effectiveAnswer(x))).length}/${closed.length} correct):\n${closedSummary || "(none)"}\n\nFree-text answers for you to grade:\n${freeSummary}\n\nGrade my free-text answers, compute the overall score, record it with lms_record_practice_attempt${props.source_exercise_id ? ` (source_exercise_id ${props.source_exercise_id})` : ""}${props.lesson_id ? ` (lesson_id ${props.lesson_id})` : props.course_id ? ` (course_id ${props.course_id})` : ""}, then reteach anything I got wrong.`
        );
      }
      return;
    }

    // Fully closed quiz: grade locally, record, then hand back to the host.
    const correctCount = closed.filter((x) =>
      isCorrect(x, effectiveAnswer(x))
    ).length;
    const score = Math.round((correctCount / closed.length) * 100);
    const missed = results.filter((r) => r.correct === false);

    recordAttempt(
      {
        topic,
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

  // ── Shared small styles ────────────────────────────────────────────────────
  const choiceStyle = (selected: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "10px 14px",
    marginBottom: 8,
    borderRadius: 10,
    fontSize: 14,
    cursor: "pointer",
    border: `1.5px solid ${selected ? colors.accent : colors.border}`,
    backgroundColor: selected ? colors.accentBg : colors.surface,
    color: colors.text,
    fontWeight: selected ? 650 : 400,
  });
  const primaryBtn: React.CSSProperties = {
    padding: "9px 18px",
    borderRadius: 10,
    fontSize: 13.5,
    fontWeight: 650,
    border: "none",
    cursor: "pointer",
    backgroundColor: colors.accent,
    color: "#ffffff",
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
        <div
          style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
            backgroundColor: colors.bg,
            padding: 24,
            maxWidth: 680,
            margin: "0 auto",
          }}
        >
          <h2 style={{ margin: "0 0 4px", fontSize: 20, color: colors.text }}>
            {hasFreeText ? "Answers sent" : `${correctCount}/${closedTotal} correct`}
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: colors.textSecondary }}>
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
              style={{
                backgroundColor:
                  correct === null
                    ? colors.surface
                    : correct
                      ? colors.doneBg
                      : colors.wrongBg,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 8,
                fontSize: 13.5,
              }}
            >
              <div style={{ fontWeight: 650, color: colors.text, marginBottom: 4 }}>
                {correct === null ? "✍️" : correct ? "✓" : "✗"} {rq.prompt}
              </div>
              <div style={{ color: colors.textSecondary }}>
                Your answer: {answerText(rq, effectiveAnswer(rq))}
                {correct === false && (
                  <> · Correct: {expectedAnswerText(rq)}</>
                )}
                {correct === null && <> · Awaiting tutor grading</>}
              </div>
            </div>
          ))}
        </div>
      </McpUseProvider>
    );
  }

  // ── Question screen ────────────────────────────────────────────────────────
  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        {/* Header + progress dots */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: colors.accentBg,
              color: colors.accent,
            }}
          >
            Practice · {topic}
          </span>
          <div style={{ display: "flex", gap: 5 }} aria-label={`Question ${index + 1} of ${questions.length}`}>
            {questions.map((dot, i) => (
              <span
                key={dot.id}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor:
                    i === index
                      ? colors.accent
                      : answers[dot.id] !== undefined
                        ? colors.done
                        : colors.border,
                }}
              />
            ))}
          </div>
        </div>

        <h2
          style={{
            margin: "0 0 14px",
            fontSize: 17,
            fontWeight: 650,
            color: colors.text,
            lineHeight: 1.4,
          }}
        >
          {index + 1}. {q.prompt}
        </h2>

        {/* Per-type input */}
        {q.type === "multiple_choice" &&
          (q.options ?? []).map((opt, i) => (
            <button key={i} onClick={() => setAnswer(i)} style={choiceStyle(answer === i)}>
              {opt}
            </button>
          ))}

        {q.type === "true_false" && (
          <div style={{ display: "flex", gap: 10 }}>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                onClick={() => setAnswer(v)}
                style={{ ...choiceStyle(answer === v), width: "auto", flex: 1, textAlign: "center" }}
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
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1.5px solid ${colors.border}`,
                backgroundColor: colors.inputBg,
                color: colors.text,
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          ) : (
            <input
              type="text"
              value={(answer as string) ?? ""}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1.5px solid ${colors.border}`,
                backgroundColor: colors.inputBg,
                color: colors.text,
                fontSize: 14,
              }}
            />
          )
        )}

        {q.type === "match" && (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: colors.textMuted }}>
              Tap an item on the left, then its match on the right.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                {(q.pairs ?? []).map((p) => {
                  const matched = ((answer as Record<string, string>) ?? {})[p.left];
                  return (
                    <button
                      key={p.left}
                      onClick={() => setPendingLeft(p.left)}
                      style={{
                        ...choiceStyle(pendingLeft === p.left),
                        borderColor:
                          pendingLeft === p.left
                            ? colors.accent
                            : matched
                              ? colors.done
                              : colors.border,
                      }}
                    >
                      {p.left}
                      {matched && (
                        <span style={{ color: colors.textMuted, fontWeight: 400 }}>
                          {" "}→ {matched}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div style={{ flex: 1 }}>
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
                    style={{
                      ...choiceStyle(false),
                      opacity: pendingLeft ? 1 : 0.6,
                      cursor: pendingLeft ? "pointer" : "default",
                    }}
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
            <p style={{ margin: "0 0 8px", fontSize: 12, color: colors.textMuted }}>
              Arrange with the ↑ / ↓ buttons.
            </p>
            {(((answer as string[]) ?? initialOrders[q.id]) ?? []).map(
              (item, i, arr) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    marginBottom: 6,
                    borderRadius: 10,
                    border: `1.5px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    fontSize: 14,
                  }}
                >
                  <span style={{ flex: 1 }}>{item}</span>
                  <button
                    aria-label={`Move "${item}" up`}
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...arr];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      setAnswer(next);
                    }}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      backgroundColor: colors.bg,
                      color: colors.text,
                      cursor: i === 0 ? "default" : "pointer",
                      opacity: i === 0 ? 0.4 : 1,
                      padding: "4px 9px",
                    }}
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
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      backgroundColor: colors.bg,
                      color: colors.text,
                      cursor: i === arr.length - 1 ? "default" : "pointer",
                      opacity: i === arr.length - 1 ? 0.4 : 1,
                      padding: "4px 9px",
                    }}
                  >
                    ↓
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Nav */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 18,
          }}
        >
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            style={{
              ...primaryBtn,
              backgroundColor: "transparent",
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              opacity: index === 0 ? 0.4 : 1,
              cursor: index === 0 ? "default" : "pointer",
            }}
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
            style={{
              ...primaryBtn,
              opacity: answeredCurrent ? 1 : 0.5,
              cursor: answeredCurrent ? "pointer" : "default",
            }}
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
