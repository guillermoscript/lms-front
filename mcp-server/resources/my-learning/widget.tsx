import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const nextLessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  sequence: z.number(),
});

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  enrolled_at: z.string(),
  lessons_total: z.number(),
  lessons_completed: z.number(),
  progress: z.number(),
  next_lesson: nextLessonSchema.nullable(),
});

const propsSchema = z.object({
  total: z.number(),
  average_progress: z.number(),
  courses: z.array(courseSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Student learning dashboard: enrolled courses with progress bars and the next lesson to take",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your courses...",
    invoked: "Learning dashboard ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Component ────────────────────────────────────────────────────────────────

export default function MyLearning() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading your courses…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { total, average_progress, courses } = props;

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-3xl bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              My Learning
            </h1>
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {total} course{total === 1 ? "" : "s"} · {average_progress}%
              average progress
            </span>
          </div>

          {courses.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-3xl">🎓</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                No enrolled courses yet
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                Browse the catalog to find your first course.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {courses.map((course) => {
                const done = course.progress >= 100;
                return (
                  <div
                    key={course.id}
                    className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[15px] leading-snug font-semibold text-zinc-900 dark:text-zinc-100">
                          {course.title}
                        </div>
                        {course.description && (
                          <div className="mt-1 line-clamp-2 text-[12.5px] text-zinc-400 dark:text-zinc-500">
                            {course.description}
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                          done
                            ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                            : "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                        }`}
                      >
                        {course.progress}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-2.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-[width] duration-400 ease-out ${
                          done
                            ? "bg-green-600 dark:bg-green-400"
                            : "bg-violet-600 dark:bg-violet-400"
                        }`}
                        style={{ width: `${Math.min(course.progress, 100)}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {course.lessons_completed}/{course.lessons_total} lessons
                        completed
                      </span>
                      {done ? (
                        <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                          ✓ Course complete
                        </span>
                      ) : course.next_lesson ? (
                        <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          Next: Lesson {course.next_lesson.sequence} ·{" "}
                          {course.next_lesson.title}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
