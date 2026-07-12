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

const submissionSchema = z.object({
  id: z.number(),
  student_name: z.string(),
  score: z.number().nullable(),
  submission_date: z.string(),
  review_status: z.string().nullable(),
});

const propsSchema = z.object({
  exam_id: z.number(),
  total: z.number(),
  submissions: z.array(submissionSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display exam submission list with per-row expandable detail panel",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading submissions…",
    invoked: "Submissions loaded",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function reviewPill(status: string | null): { bg: string; text: string } {
  switch ((status ?? "pending").toLowerCase()) {
    case "approved":
    case "graded":
      return {
        bg: "bg-green-100 dark:bg-green-900",
        text: "text-green-600 dark:text-green-400",
      };
    case "rejected":
    case "failed":
      return {
        bg: "bg-red-100 dark:bg-red-950",
        text: "text-red-600 dark:text-red-400",
      };
    case "pending":
    default:
      return {
        bg: "bg-amber-100 dark:bg-amber-950",
        text: "text-amber-600 dark:text-amber-400",
      };
  }
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

// Narrow detail response safely
interface SubmissionDetail {
  score?: number | null;
  feedback?: string | null;
  review_status?: string | null;
}

function parseDetail(raw: unknown): SubmissionDetail | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as SubmissionDetail;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExamSubmissions() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [detailMap, setDetailMap] = useState<Record<number, SubmissionDetail>>({});

  const { callToolAsync } = useCallTool<{ submission_id: number }>(
    "lms_get_submission_details"
  );

  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading submissions…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { submissions, total, exam_id } = props;

  const handleRowClick = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (detailMap[id]) return; // already fetched

    setLoadingId(id);
    try {
      const result = await callToolAsync({ submission_id: id });
      const detail = parseDetail(result?.structuredContent);
      if (detail) {
        setDetailMap((prev) => ({ ...prev, [id]: detail }));
      }
    } catch {
      // silently swallow; we just won't show the detail panel
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-4">
            <h2 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Exam #{exam_id} — Submissions
            </h2>
            <p className="mt-0.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
              {total} submission{total !== 1 ? "s" : ""} · Click a row to see details
            </p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {/* Header row */}
            <div className="grid min-w-[480px] grid-cols-[minmax(140px,1fr)_80px_120px_100px] border-b border-zinc-200 bg-zinc-100 px-4 py-[9px] dark:border-zinc-800 dark:bg-zinc-800">
              {["Student", "Score", "Date", "Status"].map((col) => (
                <span
                  key={col}
                  className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
                >
                  {col}
                </span>
              ))}
            </div>

            {/* Empty state */}
            {submissions.length === 0 && (
              <div className="p-10 text-center text-zinc-400 dark:text-zinc-500">
                <div className="mb-2.5 text-3xl">📋</div>
                <p className="m-0 text-sm">No submissions yet</p>
              </div>
            )}

            {/* Data rows */}
            {submissions.map((sub, idx) => {
              const pill = reviewPill(sub.review_status);
              const isExpanded = expandedId === sub.id;
              const isLoadingThis = loadingId === sub.id;
              const detail = detailMap[sub.id];
              const isLast = idx === submissions.length - 1 && !isExpanded;

              return (
                <div key={sub.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => handleRowClick(sub.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(sub.id);
                      }
                    }}
                    className={`grid min-w-[480px] cursor-pointer grid-cols-[minmax(140px,1fr)_80px_120px_100px] px-4 py-3 transition-colors ${
                      isLast ? "" : "border-b border-zinc-200 dark:border-zinc-800"
                    } ${
                      isExpanded
                        ? "bg-violet-50 dark:bg-violet-950"
                        : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="overflow-hidden text-[13px] font-medium text-ellipsis whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                      {sub.student_name}
                    </span>
                    <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                      {sub.score != null ? `${sub.score}%` : "—"}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDate(sub.submission_date)}
                    </span>
                    <span className="inline-flex items-center">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${pill.bg} ${pill.text}`}
                      >
                        {sub.review_status ?? "pending"}
                      </span>
                    </span>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div
                      className={`box-border min-w-[480px] border-t border-t-violet-200 bg-violet-50 px-4 py-3.5 dark:border-t-violet-900 dark:bg-violet-950 ${
                        idx === submissions.length - 1
                          ? ""
                          : "border-b border-b-zinc-200 dark:border-b-zinc-800"
                      }`}
                    >
                      {isLoadingThis ? (
                        <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                          Loading details…
                        </p>
                      ) : detail ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-5">
                            {detail.score != null && (
                              <div>
                                <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                                  Score
                                </span>
                                <span className="text-xl font-bold text-violet-600 dark:text-violet-400">
                                  {detail.score}%
                                </span>
                              </div>
                            )}
                            {detail.review_status && (
                              <div>
                                <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                                  Review status
                                </span>
                                <span
                                  className={`text-[13px] font-semibold ${
                                    reviewPill(detail.review_status).text
                                  }`}
                                >
                                  {detail.review_status}
                                </span>
                              </div>
                            )}
                          </div>
                          {detail.feedback && (
                            <div>
                              <span className="mb-1 block text-[11px] text-zinc-400 dark:text-zinc-500">
                                Feedback
                              </span>
                              <Markdown
                                content={detail.feedback}
                                dark={dark}
                                fontSize={13}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                          No additional detail available.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
