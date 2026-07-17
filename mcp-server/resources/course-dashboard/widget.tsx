import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const courseItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  tags: z.union([z.array(z.string()), z.string(), z.null()]),
  lesson_count: z.number(),
  enrollment_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const propsSchema = z.object({
  status: z.string(),
  total: z.number(),
  courses: z.array(courseItemSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display a grid of LMS courses with status pills and metadata",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading courses...",
    invoked: "Courses loaded",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTags(tags: string[] | string | null): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "published":
      return "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400";
    case "draft":
      return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
    case "archived":
      return "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400";
    default:
      return "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CourseDashboard() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading courses…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const allStatuses = ["all", ...Array.from(new Set(props.courses.map((c) => c.status)))];
  const filtered =
    activeFilter === "all"
      ? props.courses
      : props.courses.filter((c) => c.status === activeFilter);

  const labelForFilter =
    activeFilter === "all" ? "All" : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1);

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="min-h-0 bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {labelForFilter} Courses
              </h2>
              <p className="mt-0.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                {props.total} course{props.total !== 1 ? "s" : ""} total
              </p>
            </div>

            {/* Status filter tabs */}
            <div className="flex flex-wrap gap-1.5">
              {allStatuses.map((s) => {
                const active = s === activeFilter;
                return (
                  <button
                    key={s}
                    onClick={() => setActiveFilter(s)}
                    className={`cursor-pointer rounded-full border px-3 py-[5px] text-xs transition-all duration-150 ${
                      active
                        ? "border-violet-600 bg-violet-50 font-semibold text-violet-600 dark:border-violet-400 dark:bg-violet-950 dark:text-violet-400"
                        : "border-zinc-200 bg-transparent font-normal text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="p-12 text-center text-zinc-400 dark:text-zinc-500">
              <div className="mb-3 text-4xl">📚</div>
              <p className="m-0 text-sm">No courses match this filter</p>
            </div>
          )}

          {/* Card grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {filtered.map((course) => {
              const tags = normalizeTags(course.tags);
              return (
                <div
                  key={course.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-[18px] transition-shadow duration-150 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {/* Title + status */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="m-0 line-clamp-2 flex-1 text-[15px] leading-[1.3] font-semibold text-zinc-900 dark:text-zinc-100">
                      {course.title}
                    </h3>
                    <span
                      className={`shrink-0 rounded-[10px] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${statusColor(
                        course.status
                      )}`}
                    >
                      {course.status}
                    </span>
                  </div>

                  {/* Description */}
                  {course.description && (
                    <p className="m-0 line-clamp-2 text-[13px] leading-normal text-zinc-500 dark:text-zinc-400">
                      {course.description}
                    </p>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-zinc-100 px-[7px] py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {tag}
                        </span>
                      ))}
                      {tags.length > 4 && (
                        <span className="rounded-md bg-zinc-100 px-[7px] py-0.5 text-[11px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                          +{tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="mt-auto flex gap-3.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      📖 {course.lesson_count} lesson{course.lesson_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      👥 {course.enrollment_count} enrolled
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
