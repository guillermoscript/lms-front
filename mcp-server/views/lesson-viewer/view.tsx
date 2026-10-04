import { useState } from "react";
import { useDynamicTool, useSendFollowUp, useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { withWidgetBoundary } from "../shared/error-boundary";
import { type Props } from "./schema";
import { LessonBody } from "../shared/lesson";
import "virtual:mcp-use/tailwind.css";

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Opening lesson…",
    lessonNumber: (n: string) => `Lesson ${n}`,
    completedBadge: "✓ Completed",
    lockedTitle: "This lesson is locked",
    lockedBody: (previous: string | null) =>
      `Complete ${previous ? `"${previous}"` : "the previous lesson"} first — this course requires sequential completion.`,
    noContent: "No written content for this lesson.",
    completeFailed: "Could not mark the lesson complete.",
    askTutor: "I don't understand this 🙋",
    askedTutor: "Asked the tutor ✓",
    completedLabel: "✓ Lesson completed",
    marking: "Marking…",
    markComplete: "Mark lesson complete",
  },
  es: {
    loading: "Abriendo la lección…",
    lessonNumber: (n: string) => `Lección ${n}`,
    completedBadge: "✓ Completada",
    lockedTitle: "Esta lección está bloqueada",
    lockedBody: (previous: string | null) =>
      `Primero completa ${previous ? `"${previous}"` : "la lección anterior"}: este curso exige avanzar en orden.`,
    noContent: "Esta lección no tiene contenido escrito.",
    completeFailed: "No se pudo marcar la lección como completada.",
    askTutor: "No entiendo esto 🙋",
    askedTutor: "Le preguntaste al tutor ✓",
    completedLabel: "✓ Lección completada",
    marking: "Marcando…",
    markComplete: "Marcar lección como completada",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

function LessonViewer() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const {
    callTool: completeLesson,
    isPending: isCompleting,
    error: completeError,
  } = useDynamicTool<{ lesson_id: number }, unknown>("lms_complete_lesson");
  const isError = completeError !== undefined;
  // Optimistic local flag so the button flips immediately on success.
  const [justCompleted, setJustCompleted] = useState(false);
  // Tutor entry point (#353): one-shot — swaps to a confirmation after sending.
  const [askedTutor, setAskedTutor] = useState(false);

  const dark = useViewTheme() === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  // "pending" and "error" both render the loading branch, exactly like v1:
  // an isError result carries no structuredContent, and the transcript already
  // shows the tool's own error text.
  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </>
    );
  }

  const props = view.toolOutput as Props;
  const { lesson, course_title, locked, locked_by } = props;
  const completed = props.completed || justCompleted;

  const handleComplete = () => {
    // The error, if any, is already tracked by the hook's own `error` state
    // (surfaced below) — this catch only prevents an unhandled rejection.
    void completeLesson({ lesson_id: lesson.id })
      .then(() => setJustCompleted(true))
      .catch(() => {});
  };

  return (
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-[18px]">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]">
                {t.lessonNumber(fmt.number(lesson.sequence))}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {course_title}
              </span>
              {completed && (
                <span className="rounded-lg bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-600 dark:bg-green-900 dark:text-green-400">
                  {t.completedBadge}
                </span>
              )}
            </div>

            <h1 className="m-0 text-2xl leading-tight font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {lesson.title}
            </h1>

            {lesson.description && (
              <p className="mt-2.5 mb-0 text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {lesson.description}
              </p>
            )}
          </div>

          {locked ? (
            <div className="mb-5 rounded-xl bg-amber-100 p-7 text-center dark:bg-amber-950">
              <div className="mb-2 text-[28px]">🔒</div>
              <p className="m-0 text-sm font-semibold text-amber-800 dark:text-amber-300">
                {t.lockedTitle}
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-amber-800 dark:text-amber-300">
                {t.lockedBody(locked_by?.title ?? null)}
              </p>
            </div>
          ) : (
            <>
              {/* Video, custom embed and MDX content — same order and the same
                  component set the course page renders. */}
              <div className="mb-5">
                <LessonBody
                  content={lesson.content}
                  videoUrl={lesson.video_url}
                  embedCode={lesson.embed_code}
                  emptyMessage={t.noContent}
                />
              </div>

              {/* Error from mark-complete */}
              {isError && (
                <div className="mb-3.5 rounded-[10px] bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 dark:bg-red-950 dark:text-red-400">
                  {completeError instanceof Error ? completeError.message : t.completeFailed}
                </div>
              )}

              {/* Mark complete + tutor entry */}
              <div className="flex flex-wrap justify-end gap-2.5">
                <button
                  onClick={() => {
                    if (askedTutor) return;
                    setAskedTutor(true);
                    void sendFollowUp({
                      prompt: `I'm reading lesson ${lesson.sequence} "${lesson.title}" of "${course_title}" (lesson_id ${lesson.id}) and I don't fully understand it. Tutor me on it Socratically: never give me direct answers — climb the hint ladder instead (conceptual nudge, then a targeted hint at my specific confusion, then a worked example of a similar case), ground everything in this lesson's content, and quiz me at the end with lms_practice_quiz.`,
                    });
                  }}
                  disabled={askedTutor}
                  className={`cursor-pointer rounded-[10px] border-[1.5px] bg-transparent px-[18px] py-[9px] text-[13.5px] font-semibold disabled:cursor-default ${
                    askedTutor
                      ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"
                      : "border-[var(--brand-600)] text-[var(--brand-600)] dark:border-[var(--brand-400)] dark:text-[var(--brand-400)]"
                  }`}
                >
                  {askedTutor ? t.askedTutor : t.askTutor}
                </button>
                {completed ? (
                  <span className="rounded-[10px] bg-green-100 px-[18px] py-[9px] text-[13.5px] font-semibold text-green-600 dark:bg-green-900 dark:text-green-400">
                    {t.completedLabel}
                  </span>
                ) : (
                  <button
                    onClick={handleComplete}
                    disabled={isCompleting}
                    className="cursor-pointer rounded-[10px] border-none bg-[var(--brand-600)] px-[18px] py-[9px] text-[13.5px] font-semibold text-white disabled:cursor-wait disabled:opacity-70 dark:bg-[var(--brand-400)]"
                  >
                    {isCompleting ? t.marking : t.markComplete}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(LessonViewer);
