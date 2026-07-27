import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
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

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading courses…",
    // Filter-tab / heading label for a status. The underlying filter VALUE
    // ("all"/"published"/"draft"/"archived") stays English and drives the
    // actual filtering — only this rendered word changes with locale.
    filterLabel: (filter: string): string => {
      switch (filter) {
        case "all":
          return "All";
        case "published":
          return "Published";
        case "draft":
          return "Draft";
        case "archived":
          return "Archived";
        default:
          return filter.charAt(0).toUpperCase() + filter.slice(1);
      }
    },
    heading: (filter: string): string => {
      switch (filter) {
        case "all":
          return "All Courses";
        case "published":
          return "Published Courses";
        case "draft":
          return "Draft Courses";
        case "archived":
          return "Archived Courses";
        default:
          return `${filter.charAt(0).toUpperCase()}${filter.slice(1)} Courses`;
      }
    },
    totalCount: (n: number, count: string) => `${count} course${n === 1 ? "" : "s"} total`,
    status: {
      published: "Published",
      draft: "Draft",
      archived: "Archived",
    } as Record<string, string>,
    emptyFiltered: "No courses match this filter",
    lessons: (n: number, count: string) => `${count} lesson${n === 1 ? "" : "s"}`,
    enrolled: (count: string) => `${count} enrolled`,
  },
  es: {
    loading: "Cargando cursos…",
    filterLabel: (filter: string): string => {
      switch (filter) {
        case "all":
          return "Todos";
        case "published":
          return "Publicados";
        case "draft":
          return "Borrador";
        case "archived":
          return "Archivados";
        default:
          return filter;
      }
    },
    heading: (filter: string): string => {
      switch (filter) {
        case "all":
          return "Todos los cursos";
        case "published":
          return "Cursos publicados";
        case "draft":
          return "Cursos en borrador";
        case "archived":
          return "Cursos archivados";
        default:
          return `Cursos: ${filter}`;
      }
    },
    totalCount: (n: number, count: string) =>
      `${count} ${n === 1 ? "curso" : "cursos"} en total`,
    status: {
      published: "Publicado",
      draft: "Borrador",
      archived: "Archivado",
    } as Record<string, string>,
    emptyFiltered: "Ningún curso coincide con este filtro",
    lessons: (n: number, count: string) =>
      `${count} ${n === 1 ? "lección" : "lecciones"}`,
    enrolled: (count: string) => `${count} inscritos`,
  },
};

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
      return "bg-[var(--brand-50)] text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]";
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
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
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

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="min-h-0 bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {t.heading(activeFilter)}
              </h2>
              <p className="mt-0.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                {t.totalCount(props.total, fmt.number(props.total))}
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
                        ? "border-[var(--brand-600)] bg-[var(--brand-50)] font-semibold text-[var(--brand-600)] dark:border-[var(--brand-400)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]"
                        : "border-zinc-200 bg-transparent font-normal text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {t.filterLabel(s)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="p-12 text-center text-zinc-400 dark:text-zinc-500">
              <div className="mb-3 text-4xl">📚</div>
              <p className="m-0 text-sm">{t.emptyFiltered}</p>
            </div>
          )}

          {/*
            Card grid, three shared rows: heading, body (description + tags),
            footer. Each card adopts them with `grid-rows-subgrid`, so a course
            with no description or no tags — "Diseño de APIs REST" in the
            fixture — leaves a short row instead of a hole, and every card's
            stats bar sits on the same line as its neighbours' rather than
            wherever that card's own content happened to run out.
          */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] grid-rows-[auto_auto_auto_auto] gap-4">
            {filtered.map((course) => {
              const tags = normalizeTags(course.tags);
              return (
                <div
                  key={course.id}
                  className="row-span-4 grid grid-rows-subgrid gap-2.5 rounded-xl border border-zinc-200 bg-white p-[18px] transition-shadow duration-150 dark:border-zinc-800 dark:bg-zinc-900"
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
                      {t.status[course.status.toLowerCase()] ?? course.status}
                    </span>
                  </div>

                  {/* Description — its own row, so a card without one leaves a
                      short row rather than dragging the tags up out of line
                      with the rest of the row. */}
                  <div>
                    {course.description && (
                      <p className="m-0 line-clamp-2 text-[13px] leading-normal text-zinc-500 dark:text-zinc-400">
                        {course.description}
                      </p>
                    )}
                  </div>

                  {/* Tags — own row, so every card's tags share a baseline. */}
                  <div>
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
                  </div>

                  {/* Stats */}
                  <div className="flex gap-3.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      📖 {t.lessons(course.lesson_count, fmt.number(course.lesson_count))}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      👥 {t.enrolled(fmt.number(course.enrollment_count))}
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
