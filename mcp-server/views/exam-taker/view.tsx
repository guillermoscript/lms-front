import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useDynamicTool, useSendFollowUp, useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { withWidgetBoundary } from "../shared/error-boundary";
import { ViewPending } from "../shared/view-pending";
import { Markdown } from "../shared/markdown";
import { type Props, type Question, type SubmitResult } from "./schema";
import "virtual:mcp-use/tailwind.css";

// The student answers and submits here; the model never sees or picks the
// answers. Mirrors the web exam-taker: one question at a time, a countdown
// that auto-submits at zero, a single submit through lms_submit_exam (which
// grades on the school's AI key — the score always comes from the platform).

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Opening the exam…",
    exam: "Exam",
    questionsCount: (n: string, one: boolean) => `${n} question${one ? "" : "s"}`,
    minutes: (n: string) => `${n} min`,
    noTimeLimit: "No time limit",
    oneAttempt:
      "You can submit this exam only once. Your answers are graded by the school when you submit.",
    timedNote: "The timer starts when you begin and the exam is submitted automatically when it runs out.",
    start: "Start exam",
    noQuestions: "This exam has no questions yet.",
    alreadyTitle: "Already submitted",
    alreadyBody: "You have already taken this exam. Exams can be submitted only once.",
    seeResults: "See my results",
    seeResultsPrompt: (title: string) =>
      `Show my exam results, including "${title}" (use lms_my_exam_results).`,
    questionOf: (current: string, total: string) => `Question ${current} of ${total}`,
    goTo: (n: string, answered: boolean) => `Go to question ${n}${answered ? " (answered)" : ""}`,
    timeLeft: "Time left",
    trueLabel: "True",
    falseLabel: "False",
    freeTextPlaceholder: "Write your answer…",
    back: "Back",
    next: "Next",
    review: "Review & submit",
    reviewTitle: "Ready to submit?",
    answeredOf: (a: string, total: string) => `${a} of ${total} answered`,
    unanswered: (n: string, one: boolean) =>
      `${n} question${one ? " is" : "s are"} unanswered and will count as blank.`,
    keepAnswering: "Keep answering",
    submit: "Submit exam",
    submitting: "Submitting and grading…",
    submitFailed: "The exam could not be submitted. Your answers are still here — try again.",
    timeUp: "Time is up — submitting your answers…",
    gradedTitle: "Exam submitted",
    score: "Score",
    pendingTitle: "Answers saved",
    pendingBody:
      "Your exam counts as submitted but is not graded yet (it may need a teacher's review). The score will appear in your results.",
    feedback: "Feedback",
    breakdown: "See the per-question breakdown",
  },
  es: {
    loading: "Abriendo el examen…",
    exam: "Examen",
    questionsCount: (n: string, one: boolean) => `${n} pregunta${one ? "" : "s"}`,
    minutes: (n: string) => `${n} min`,
    noTimeLimit: "Sin límite de tiempo",
    oneAttempt:
      "Solo puedes entregar este examen una vez. La escuela califica tus respuestas al entregarlo.",
    timedNote: "El tiempo empieza al comenzar y el examen se entrega solo cuando se acaba.",
    start: "Comenzar examen",
    noQuestions: "Este examen todavía no tiene preguntas.",
    alreadyTitle: "Ya entregado",
    alreadyBody: "Ya realizaste este examen. Los exámenes solo se pueden entregar una vez.",
    seeResults: "Ver mis resultados",
    seeResultsPrompt: (title: string) =>
      `Muéstrame mis resultados de exámenes, incluido "${title}" (usa lms_my_exam_results).`,
    questionOf: (current: string, total: string) => `Pregunta ${current} de ${total}`,
    goTo: (n: string, answered: boolean) => `Ir a la pregunta ${n}${answered ? " (respondida)" : ""}`,
    timeLeft: "Tiempo restante",
    trueLabel: "Verdadero",
    falseLabel: "Falso",
    freeTextPlaceholder: "Escribe tu respuesta…",
    back: "Atrás",
    next: "Siguiente",
    review: "Revisar y entregar",
    reviewTitle: "¿Listo para entregar?",
    answeredOf: (a: string, total: string) => `${a} de ${total} respondidas`,
    unanswered: (n: string, one: boolean) =>
      `${n} pregunta${one ? " está" : "s están"} sin responder y contará${one ? "" : "n"} en blanco.`,
    keepAnswering: "Seguir respondiendo",
    submit: "Entregar examen",
    submitting: "Entregando y calificando…",
    submitFailed: "No se pudo entregar el examen. Tus respuestas siguen aquí — inténtalo de nuevo.",
    timeUp: "Se acabó el tiempo — entregando tus respuestas…",
    gradedTitle: "Examen entregado",
    score: "Nota",
    pendingTitle: "Respuestas guardadas",
    pendingBody:
      "Tu examen cuenta como entregado pero aún no está calificado (puede necesitar la revisión de un profesor). La nota aparecerá en tus resultados.",
    feedback: "Comentarios",
    breakdown: "Ver el desglose por pregunta",
  },
};

type Strings = typeof STRINGS.en;
type Phase = "intro" | "taking" | "review" | "submitting" | "done";

const PASS_THRESHOLD = 70;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isAnswered(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

// ── Answer inputs ────────────────────────────────────────────────────────────

function ChoiceButton({
  selected,
  label,
  onSelect,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
        selected
          ? "border-[var(--brand-600)] bg-[var(--brand-50)] text-zinc-900 dark:border-[var(--brand-400)] dark:bg-[var(--brand-950)] dark:text-zinc-100"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <span
        aria-hidden
        className={`size-4 shrink-0 rounded-full border-2 ${
          selected
            ? "border-[var(--brand-600)] bg-[var(--brand-600)] dark:border-[var(--brand-400)] dark:bg-[var(--brand-400)]"
            : "border-zinc-300 dark:border-zinc-600"
        }`}
      />
      <span>{label}</span>
    </button>
  );
}

function AnswerInput({
  question,
  value,
  onChange,
  t,
}: {
  question: Question;
  value: string | undefined;
  onChange: (v: string) => void;
  t: Strings;
}) {
  if (question.question_type === "multiple_choice") {
    return (
      <div role="radiogroup" aria-label={question.question_text} className="flex flex-col gap-2">
        {(question.options ?? []).map((o) => (
          <ChoiceButton
            key={o.option_id}
            selected={value === String(o.option_id)}
            label={o.option_text}
            onSelect={() => onChange(String(o.option_id))}
          />
        ))}
      </div>
    );
  }
  if (question.question_type === "true_false") {
    return (
      <div role="radiogroup" aria-label={question.question_text} className="grid grid-cols-2 gap-2">
        <ChoiceButton selected={value === "true"} label={t.trueLabel} onSelect={() => onChange("true")} />
        <ChoiceButton selected={value === "false"} label={t.falseLabel} onSelect={() => onChange("false")} />
      </div>
    );
  }
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t.freeTextPlaceholder}
      aria-label={question.question_text}
      rows={6}
      maxLength={20000}
      className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-zinc-900 outline-none focus:border-[var(--brand-600)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-[var(--brand-400)]"
    />
  );
}

// ── Component ────────────────────────────────────────────────────────────────

function ExamTaker() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();
  const sendFollowUp = useSendFollowUp();
  const submitExam = useDynamicTool<
    { exam_id: number; answers: Array<{ question_id: number; answer: string }> },
    SubmitResult
  >("lms_submit_exam");

  const props = view.status === "ready" ? (view.toolOutput as Props) : undefined;

  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | false>(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  // The auto-submit timer reads the latest answers, not the ones captured
  // when the interval was created.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  // The hook's handle is a new object each render; keep `submit` stable so the
  // countdown effect is not torn down and re-armed by unrelated renders.
  const callSubmitRef = useRef(submitExam.callTool);
  callSubmitRef.current = submitExam.callTool;
  const examId = props?.exam_id;

  const submit = useCallback(async () => {
    if (examId === undefined) return;
    setPhase("submitting");
    setSubmitError(false);
    const payload = Object.entries(answersRef.current)
      .filter(([, v]) => isAnswered(v))
      .map(([id, answer]) => ({ question_id: Number(id), answer }));
    try {
      const res = await callSubmitRef.current({ exam_id: examId, answers: payload });
      setResult(res.structuredContent ?? null);
      setPhase("done");
    } catch (err) {
      // Retrying is safe: submit_exam returns the same submission.
      const reason = err instanceof Error ? err.message.replace(/^Error:\s*/, "").trim() : "";
      setSubmitError(reason);
      setPhase("review");
    }
  }, [examId]);

  // Countdown. Starts with the exam; at zero it submits whatever is answered,
  // exactly like the web taker.
  useEffect(() => {
    if (timeLeft === null || phase === "submitting" || phase === "done") return;
    if (timeLeft <= 0) {
      if (!autoSubmitted) {
        setAutoSubmitted(true);
        void submit();
      }
      return;
    }
    const id = setTimeout(() => setTimeLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, phase, autoSubmitted, submit]);

  if (view.status !== "ready" || !props) {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <ViewPending view={view} label={t.loading} />
        </div>
      </>
    );
  }

  const { title, description, duration_minutes, questions } = props;
  const total = questions.length;
  const answeredCount = questions.filter((q) => isAnswered(answers[q.question_id])).length;
  const askResults = () => void sendFollowUp({ prompt: t.seeResultsPrompt(title) });

  const card = "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";
  const primaryBtn =
    "rounded-lg bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-700)] disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryBtn =
    "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";

  const header = (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="rounded-lg bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]">
          {t.exam}
        </span>
        <h1 className="mt-2 mb-0 text-[22px] leading-tight font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
      </div>
      {timeLeft !== null && (phase === "taking" || phase === "review") && (
        <div
          role="timer"
          aria-label={t.timeLeft}
          className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
            timeLeft < 300
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {formatClock(Math.max(0, timeLeft))}
        </div>
      )}
    </div>
  );

  let body: ReactNode;

  if (props.already_submitted) {
    body = (
      <div className={`${card} text-center`}>
        <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{t.alreadyTitle}</p>
        <p className="mt-1.5 mb-4 text-[13px] text-zinc-500 dark:text-zinc-400">{t.alreadyBody}</p>
        <button type="button" className={primaryBtn} onClick={askResults}>
          {t.seeResults}
        </button>
      </div>
    );
  } else if (total === 0) {
    body = (
      <div className={`${card} text-center text-sm text-zinc-500 dark:text-zinc-400`}>{t.noQuestions}</div>
    );
  } else if (phase === "intro") {
    body = (
      <div className={card}>
        {description && (
          <div className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            <Markdown content={description} dark={dark} fontSize={14} />
          </div>
        )}
        <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          <span className="rounded-lg bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
            {t.questionsCount(fmt.number(total), total === 1)}
          </span>
          <span className="rounded-lg bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
            {duration_minutes ? t.minutes(fmt.number(duration_minutes)) : t.noTimeLimit}
          </span>
        </div>
        <p className="mt-0 mb-1 text-[13px] text-zinc-500 dark:text-zinc-400">{t.oneAttempt}</p>
        {duration_minutes ? (
          <p className="mt-0 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">{t.timedNote}</p>
        ) : null}
        <button
          type="button"
          className={`${primaryBtn} mt-4`}
          onClick={() => {
            if (duration_minutes) setTimeLeft(duration_minutes * 60);
            setPhase("taking");
          }}
        >
          {t.start}
        </button>
      </div>
    );
  } else if (phase === "taking") {
    const q = questions[index];
    body = (
      <>
        <nav aria-label={t.questionOf(fmt.number(index + 1), fmt.number(total))} className="mb-3 flex flex-wrap gap-1.5">
          {questions.map((qq, i) => {
            const done = isAnswered(answers[qq.question_id]);
            return (
              <button
                key={qq.question_id}
                type="button"
                aria-current={i === index ? "step" : undefined}
                aria-label={t.goTo(fmt.number(i + 1), done)}
                onClick={() => setIndex(i)}
                className={`size-7 rounded-md text-xs font-bold tabular-nums ${
                  i === index
                    ? "bg-[var(--brand-600)] text-white"
                    : done
                      ? "bg-[var(--brand-50)] text-[var(--brand-700)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-300)]"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>
        <div className={card}>
          <p className="mt-0 mb-2 text-xs font-semibold text-zinc-400 dark:text-zinc-500">
            {t.questionOf(fmt.number(index + 1), fmt.number(total))}
          </p>
          <div className="mb-4 text-[15px] leading-relaxed font-medium text-zinc-900 dark:text-zinc-100">
            <Markdown content={q.question_text} dark={dark} fontSize={15} />
          </div>
          <AnswerInput
            question={q}
            value={answers[q.question_id]}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.question_id]: v }))}
            t={t}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" className={secondaryBtn} disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            {t.back}
          </button>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {t.answeredOf(fmt.number(answeredCount), fmt.number(total))}
          </span>
          {index < total - 1 ? (
            <button type="button" className={primaryBtn} onClick={() => setIndex((i) => i + 1)}>
              {t.next}
            </button>
          ) : (
            <button type="button" className={primaryBtn} onClick={() => setPhase("review")}>
              {t.review}
            </button>
          )}
        </div>
      </>
    );
  } else if (phase === "review" || phase === "submitting") {
    const blank = total - answeredCount;
    const submitting = phase === "submitting";
    body = (
      <div className={card}>
        <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
          {autoSubmitted && submitting ? t.timeUp : t.reviewTitle}
        </p>
        <p className="mt-1.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
          {t.answeredOf(fmt.number(answeredCount), fmt.number(total))}
        </p>
        {blank > 0 && (
          <p className="mt-1 mb-0 text-[13px] text-amber-700 dark:text-amber-400">
            {t.unanswered(fmt.number(blank), blank === 1)}
          </p>
        )}
        <p className="mt-3 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">{t.oneAttempt}</p>
        {submitError !== false && (
          <p role="alert" className="mt-3 mb-0 text-[13px] text-red-600 dark:text-red-400">
            {t.submitFailed}
            {submitError ? <span className="mt-1 block text-zinc-500 dark:text-zinc-400">{submitError}</span> : null}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!autoSubmitted && (
            <button
              type="button"
              className={secondaryBtn}
              disabled={submitting}
              onClick={() => {
                setSubmitError(false);
                setPhase("taking");
              }}
            >
              {t.keepAnswering}
            </button>
          )}
          <button type="button" className={primaryBtn} disabled={submitting} onClick={() => void submit()}>
            {submitting ? t.submitting : t.submit}
          </button>
        </div>
      </div>
    );
  } else {
    const graded = result?.status === "graded" && result.score !== null;
    const passed = graded && (result?.score ?? 0) >= PASS_THRESHOLD;
    body = (
      <div className={card} role="status">
        {graded ? (
          <>
            <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{t.gradedTitle}</p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`min-w-[64px] rounded-xl px-3 py-2 text-center text-2xl font-bold tabular-nums ${
                  passed
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400"
                    : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                }`}
              >
                {fmt.number(Math.round(result?.score ?? 0))}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {t.score} · {t.answeredOf(fmt.number(result?.answered_count ?? 0), fmt.number(result?.question_count ?? total))}
              </span>
            </div>
            {result?.overall_feedback && (
              <div className="mt-4 rounded-[10px] border border-zinc-200 bg-[var(--brand-50)] px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-[var(--brand-950)] dark:text-zinc-400">
                <p className="mt-0 mb-1 text-xs font-semibold">{t.feedback}</p>
                <Markdown content={result.overall_feedback} dark={dark} fontSize={13} />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{t.pendingTitle}</p>
            <p className="mt-1.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">{t.pendingBody}</p>
          </>
        )}
        <button type="button" className={`${secondaryBtn} mt-4`} onClick={askResults}>
          {graded ? t.breakdown : t.seeResults}
        </button>
      </div>
    );
  }

  return (
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {header}
          {body}
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(ExamTaker);
