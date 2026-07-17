import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";
import { Markdown } from "../shared/markdown";

// ── Schema ──────────────────────────────────────────────────────────────────

const resultSchema = z.object({
  submission_id: z.number(),
  exam_id: z.number(),
  exam_title: z.string(),
  course_title: z.string().nullable(),
  score: z.number().nullable(),
  feedback: z.string().nullable(),
  review_status: z.string().nullable(),
  submitted_at: z.string(),
});

const propsSchema = z.object({
  total: z.number(),
  average_score: z.number().nullable(),
  results: z.array(resultSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Student exam results list with scores, review status, and expandable feedback",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your exam results...",
    invoked: "Exam results ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

const PASS_THRESHOLD = 70;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MyExamResults() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading your exam results…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { total, average_score, results } = props;

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[760px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              My Exam Results
            </h1>
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {total} submission{total === 1 ? "" : "s"}
              {average_score !== null
                ? ` · ${Math.round(average_score)} avg score`
                : ""}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-3xl">📝</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                No exam submissions yet
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                Your scores and feedback will appear here after you take an exam.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {results.map((r, idx) => {
                const graded = r.score !== null;
                const passed = graded && (r.score ?? 0) >= PASS_THRESHOLD;
                const isOpen = expanded.has(r.submission_id);
                return (
                  <div
                    key={r.submission_id}
                    className={
                      idx === results.length - 1
                        ? ""
                        : "border-b border-zinc-200 dark:border-zinc-800"
                    }
                  >
                    <div
                      role={r.feedback ? "button" : undefined}
                      tabIndex={r.feedback ? 0 : undefined}
                      aria-expanded={r.feedback ? isOpen : undefined}
                      className={`flex items-center gap-3 px-4 py-[13px] ${
                        r.feedback ? "cursor-pointer" : "cursor-default"
                      }`}
                      onClick={() => r.feedback && toggle(r.submission_id)}
                      onKeyDown={(e) => {
                        if (r.feedback && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          toggle(r.submission_id);
                        }
                      }}
                    >
                      {/* Score badge */}
                      <span
                        className={`min-w-[46px] shrink-0 rounded-[10px] px-2 py-[5px] text-center text-sm font-bold tabular-nums ${
                          graded
                            ? passed
                              ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                              : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                        }`}
                      >
                        {graded ? Math.round(r.score ?? 0) : "—"}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                          {r.exam_title}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                          {r.course_title ? `${r.course_title} · ` : ""}
                          {formatDate(r.submitted_at)}
                          {r.review_status ? ` · ${r.review_status}` : ""}
                        </div>
                      </div>

                      {r.feedback && (
                        <span className="shrink-0 text-xs font-semibold text-violet-600 dark:text-violet-400">
                          {isOpen ? "Hide feedback ▲" : "Feedback ▼"}
                        </span>
                      )}
                    </div>

                    {isOpen && r.feedback && (
                      <div className="mr-4 mb-[13px] ml-[74px] rounded-[10px] border border-zinc-200 bg-violet-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-violet-950 dark:text-zinc-400">
                        <Markdown content={r.feedback} dark={dark} fontSize={13} />
                      </div>
                    )}
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
