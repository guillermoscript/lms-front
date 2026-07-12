import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";
import { Markdown } from "../shared/markdown";

// ── Schema ──────────────────────────────────────────────────────────────────

const lessonSchema = z.object({
  id: z.number(),
  course_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  summary: z.string().nullable(),
  content: z.string().nullable(),
  video_url: z.string().nullable(),
  embed_code: z.string().nullable(),
  sequence: z.number(),
});

const propsSchema = z.object({
  lesson: lessonSchema,
  course_title: z.string(),
  completed: z.boolean(),
  locked: z.boolean(),
  locked_by: z.object({ id: z.number(), title: z.string() }).nullable(),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Student lesson reading view with content, video link, and a mark-complete action",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Opening lesson…",
    invoked: "Lesson ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Component ────────────────────────────────────────────────────────────────

export default function LessonViewer() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const {
    callTool: completeLesson,
    isPending: isCompleting,
    isError,
    error,
  } = useCallTool("lms_complete_lesson");
  // Optimistic local flag so the button flips immediately on success.
  const [justCompleted, setJustCompleted] = useState(false);
  // Tutor entry point (#353): one-shot — swaps to a confirmation after sending.
  const [askedTutor, setAskedTutor] = useState(false);

  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Opening lesson…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { lesson, course_title, locked, locked_by } = props;
  const completed = props.completed || justCompleted;

  const handleComplete = () => {
    completeLesson(
      { lesson_id: lesson.id },
      { onSuccess: () => setJustCompleted(true) }
    );
  };

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-[18px]">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                Lesson {lesson.sequence}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {course_title}
              </span>
              {completed && (
                <span className="rounded-lg bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-600 dark:bg-green-900 dark:text-green-400">
                  ✓ Completed
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
                This lesson is locked
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-amber-800 dark:text-amber-300">
                Complete{locked_by ? ` "${locked_by.title}"` : " the previous lesson"}{" "}
                first — this course requires sequential completion.
              </p>
            </div>
          ) : (
            <>
              {/* Video link */}
              {lesson.video_url && (
                <div className="mb-5 flex items-center gap-2.5 rounded-[10px] border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950">
                  <span className="text-xl">▶️</span>
                  <div className="min-w-0">
                    <div className="mb-0.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                      Video lesson
                    </div>
                    <a
                      href={lesson.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium break-all text-sky-700 no-underline dark:text-sky-400"
                    >
                      {lesson.video_url}
                    </a>
                  </div>
                </div>
              )}

              {/* Content */}
              {lesson.content ? (
                <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <Markdown content={lesson.content} dark={dark} fontSize={14} />
                </div>
              ) : (
                <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-8 text-center text-[13px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                  No written content for this lesson
                  {lesson.video_url ? " — watch the video above." : "."}
                </div>
              )}

              {/* Error from mark-complete */}
              {isError && (
                <div className="mb-3.5 rounded-[10px] bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 dark:bg-red-950 dark:text-red-400">
                  {error instanceof Error
                    ? error.message
                    : "Could not mark the lesson complete."}
                </div>
              )}

              {/* Mark complete + tutor entry */}
              <div className="flex flex-wrap justify-end gap-2.5">
                <button
                  onClick={() => {
                    if (askedTutor) return;
                    setAskedTutor(true);
                    sendFollowUpMessage(
                      `I'm reading lesson ${lesson.sequence} "${lesson.title}" of "${course_title}" (lesson_id ${lesson.id}) and I don't fully understand it. Tutor me on it Socratically: use the socratic-tutor approach, don't just give answers, and quiz me at the end with lms_practice_quiz.`
                    );
                  }}
                  disabled={askedTutor}
                  className={`cursor-pointer rounded-[10px] border-[1.5px] bg-transparent px-[18px] py-[9px] text-[13.5px] font-semibold disabled:cursor-default ${
                    askedTutor
                      ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"
                      : "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400"
                  }`}
                >
                  {askedTutor ? "Asked the tutor ✓" : "I don't understand this 🙋"}
                </button>
                {completed ? (
                  <span className="rounded-[10px] bg-green-100 px-[18px] py-[9px] text-[13.5px] font-semibold text-green-600 dark:bg-green-900 dark:text-green-400">
                    ✓ Lesson completed
                  </span>
                ) : (
                  <button
                    onClick={handleComplete}
                    disabled={isCompleting}
                    className="cursor-pointer rounded-[10px] border-none bg-violet-600 px-[18px] py-[9px] text-[13.5px] font-semibold text-white disabled:cursor-wait disabled:opacity-70 dark:bg-violet-400"
                  >
                    {isCompleting ? "Marking…" : "Mark lesson complete"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
