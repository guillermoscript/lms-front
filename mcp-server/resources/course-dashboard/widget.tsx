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
    // A teacher with no courses at all is not looking at a filtered result —
    // there is no filter to blame and they need a way forward, not a dead end.
    headingFirstRun: "Courses",
    emptyFirstRunTitle: "No courses yet",
    emptyFirstRunBody:
      "Your first course is where lessons, exams and enrollments live. Start with a title and an outline — you can publish it later.",
    emptyFirstRunCta: "Create my first course",
    // Sent to the model when that button is pressed.
    emptyFirstRunPrompt:
      "I'd like to create my first course. Ask me for a title and what it should cover, then create it.",
    emptyStatus: (label: string) => `No ${label.toLowerCase()} courses yet`,
    emptyPage: (count: string) => `No courses on this page — ${count} in total`,
    showAll: (n: number, count: string) => `Show all ${count} course${n === 1 ? "" : "s"}`,
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
    headingFirstRun: "Cursos",
    emptyFirstRunTitle: "Todavía no tienes cursos",
    emptyFirstRunBody:
      "Tu primer curso es donde viven las lecciones, los exámenes y las inscripciones. Empieza con un título y un esquema — puedes publicarlo más tarde.",
    emptyFirstRunCta: "Crear mi primer curso",
    emptyFirstRunPrompt:
      "Quiero crear mi primer curso. Pregúntame por el título y de qué debería tratar, y luego créalo.",
    emptyStatus: (label: string) => `Todavía no hay cursos con el estado «${label.toLowerCase()}»`,
    emptyPage: (count: string) => `No hay cursos en esta página — ${count} en total`,
    showAll: (n: number, count: string) =>
      `Ver ${n === 1 ? "el" : "los"} ${count} curso${n === 1 ? "" : "s"}`,
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
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
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

  // With nothing to filter, the chip row collapses to a lone "All" that does
  // nothing — a control the empty-state copy would otherwise be pointing at.
  const hasFilters = props.courses.length > 0 && allStatuses.length > 1;
  const firstRun = props.total === 0 && props.status === "all";

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="min-h-0 bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {firstRun ? t.headingFirstRun : t.heading(activeFilter)}
              </h2>
              {!firstRun && (
                <p className="mt-0.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {t.totalCount(props.total, fmt.number(props.total))}
                </p>
              )}
            </div>

            {/* Status filter tabs */}
            <div className={`flex flex-wrap gap-1.5 ${hasFilters ? "" : "hidden"}`}>
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
          {/* Empty states — four different situations, four different answers. */}
          {filtered.length === 0 &&
            (props.total === 0 ? (
              firstRun ? (
                /* No courses exist at all: no filter to blame, and a first-run
                   teacher needs a way forward rather than a dead end. */
                <div className="p-12 text-center">
                  <div className="mb-3 text-4xl">📚</div>
                  <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.emptyFirstRunTitle}
                  </p>
                  <p className="mx-auto mt-1.5 mb-0 max-w-sm text-[13px] text-zinc-500 dark:text-zinc-400">
                    {t.emptyFirstRunBody}
                  </p>
                  <button
                    onClick={() => sendFollowUpMessage(t.emptyFirstRunPrompt)}
                    className="mt-4 cursor-pointer rounded-lg border border-[var(--brand-600)] bg-[var(--brand-600)] px-4 py-2 text-[13px] font-semibold text-white dark:border-[var(--brand-400)] dark:bg-[var(--brand-400)] dark:text-zinc-950"
                  >
                    {t.emptyFirstRunCta}
                  </button>
                </div>
              ) : (
                /* The tool itself was called with a status filter. */
                <div className="p-12 text-center text-zinc-400 dark:text-zinc-500">
                  <div className="mb-3 text-4xl">📚</div>
                  <p className="m-0 text-sm">{t.emptyStatus(t.filterLabel(props.status))}</p>
                </div>
              )
            ) : activeFilter !== "all" ? (
              /* Courses exist; the chip above filtered them all out. */
              <div className="p-12 text-center text-zinc-400 dark:text-zinc-500">
                <div className="mb-3 text-4xl">📚</div>
                <p className="m-0 text-sm">{t.emptyFiltered}</p>
                <button
                  onClick={() => setActiveFilter("all")}
                  className="mt-3 cursor-pointer rounded-lg border border-zinc-200 bg-transparent px-3.5 py-1.5 text-[12.5px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                >
                  {t.showAll(props.total, fmt.number(props.total))}
                </button>
              </div>
            ) : (
              /* Courses exist and no chip is active, so this page simply has no
                 rows — an offset past the end of the list. Blaming a filter here
                 would point at a control the teacher never touched. */
              <div className="p-12 text-center text-zinc-400 dark:text-zinc-500">
                <div className="mb-3 text-4xl">📚</div>
                <p className="m-0 text-sm">{t.emptyPage(fmt.number(props.total))}</p>
              </div>
            ))}

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
