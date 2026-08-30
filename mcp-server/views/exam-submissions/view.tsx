import { Fragment, useState } from "react";
import { useDynamicTool, useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { LoadMore, usePagedItems } from "../shared/paging";
import { isNamedStudent, studentDisplayName } from "../shared/student-display";
import { withWidgetBoundary } from "../shared/error-boundary";
import { type Props, type Submission } from "./schema";
import { Markdown } from "../shared/markdown";
import "virtual:mcp-use/tailwind.css";

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading submissions…",
    heading: (id: number) => `Exam #${id} — Submissions`,
    subtitle: (n: number, count: string) =>
      `${count} submission${n === 1 ? "" : "s"} · Click a row to see details`,
    colStudent: "Student",
    colScore: "Score",
    colDate: "Date",
    colStatus: "Status",
    tableCaption: (id: number) => `Submissions for exam ${id}`,
    empty: "No submissions yet",
    unnamedStudent: "Unnamed student",
    loadingDetails: "Loading details…",
    detailScore: "Score",
    detailReviewStatus: "Review status",
    detailFeedback: "Feedback",
    noDetail: "No additional detail available.",
    detailFailed: "Could not load the details for this submission.",
    retry: "Retry",
    reviewStatus: {
      approved: "Approved",
      graded: "Graded",
      rejected: "Rejected",
      failed: "Failed",
      pending: "Pending",
    } as Record<string, string>,
  },
  es: {
    loading: "Cargando entregas…",
    heading: (id: number) => `Examen n.º ${id} — Entregas`,
    subtitle: (n: number, count: string) =>
      `${count} ${n === 1 ? "entrega" : "entregas"} · Haz clic en una fila para ver los detalles`,
    colStudent: "Estudiante",
    colScore: "Nota",
    colDate: "Fecha",
    colStatus: "Estado",
    tableCaption: (id: number) => `Entregas del examen ${id}`,
    empty: "Todavía no hay entregas",
    unnamedStudent: "Estudiante sin nombre",
    loadingDetails: "Cargando detalles…",
    detailScore: "Nota",
    detailReviewStatus: "Estado de revisión",
    detailFeedback: "Comentarios",
    noDetail: "No hay más detalles disponibles.",
    detailFailed: "No se pudieron cargar los detalles de esta entrega.",
    retry: "Reintentar",
    reviewStatus: {
      approved: "Aprobada",
      graded: "Calificada",
      rejected: "Rechazada",
      failed: "Suspendida",
      pending: "Pendiente",
    } as Record<string, string>,
  },
};

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

function ExamSubmissions() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [detailMap, setDetailMap] = useState<Record<number, SubmissionDetail>>({});
  // A failed fetch used to leave the panel showing "No additional detail
  // available." — indistinguishable from a submission that genuinely has none.
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());

  const { callTool: fetchSubmissionDetail } = useDynamicTool<
    { submission_id: number },
    unknown
  >("lms_get_submission_details");

  const t = useStrings(STRINGS);
  const fmt = useFormat();

  // Before the ready guard: hooks run unconditionally, and the seed is
  // re-read from toolOutput on every render until a page is actually appended.
  const props = view.toolOutput as Props | undefined;
  const paged = usePagedItems<Submission>({
    toolName: "lms_list_exam_submissions",
    itemsKey: "submissions",
    initialItems: props?.submissions,
    page: props,
    args: { exam_id: props?.exam_id },
  });

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

  const { total, exam_id } = props as Props;
  const submissions = paged.items;

  const reviewLabel = (status: string | null): string => {
    const key = (status ?? "pending").toLowerCase();
    return t.reviewStatus[key] ?? status ?? "pending";
  };

  const fetchDetail = async (id: number) => {
    setLoadingId(id);
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const result = await fetchSubmissionDetail({ submission_id: id });
      const detail = parseDetail(result?.structuredContent);
      if (detail) {
        setDetailMap((prev) => ({ ...prev, [id]: detail }));
      } else {
        // A result we cannot read is a failure, not an empty submission.
        setFailedIds((prev) => new Set(prev).add(id));
      }
    } catch {
      setFailedIds((prev) => new Set(prev).add(id));
    } finally {
      setLoadingId(null);
    }
  };

  const handleRowClick = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (detailMap[id]) return; // already fetched
    void fetchDetail(id);
  };

  return (
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-4">
            <h2 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.heading(exam_id)}
            </h2>
            <p className="mt-0.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
              {t.subtitle(total, fmt.number(total))}
            </p>
          </div>

          {/*
            A real <table> with a disclosure row per submission.

            The whole row stays clickable for the mouse, but the control the
            keyboard and a screen reader actually get is the button in the first
            cell — a <tr> cannot be a button, and the old `role="button"` on the
            row swallowed the four cells into one flat announcement with no
            column names attached to any of them.
          */}
          <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[480px] table-fixed border-collapse text-left">
              <caption className="sr-only">{t.tableCaption(exam_id)}</caption>
              <colgroup>
                <col />
                <col className="w-20" />
                <col className="w-[120px]" />
                <col className="w-[100px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
                  {[t.colStudent, t.colScore, t.colDate, t.colStatus].map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="px-4 py-[9px] text-[11px] font-bold tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-10 text-center text-zinc-400 dark:text-zinc-500"
                    >
                      <div className="mb-2.5 text-3xl">📋</div>
                      <p className="m-0 text-sm">{t.empty}</p>
                    </td>
                  </tr>
                )}

                {submissions.map((sub) => {
                  const pill = reviewPill(sub.review_status);
                  const isExpanded = expandedId === sub.id;
                  const isLoadingThis = loadingId === sub.id;
                  const detail = detailMap[sub.id];
                  const detailFailed = failedIds.has(sub.id);

                  return (
                    <Fragment key={sub.id}>
                      <tr
                        onClick={() => handleRowClick(sub.id)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded
                            ? "bg-[var(--brand-50)] dark:bg-[var(--brand-950)]"
                            : "border-b border-zinc-200 bg-transparent hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <th scope="row" className="px-4 py-3 font-normal">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={(e) => {
                              // The row handler already fires on click; without
                              // this the button would toggle it straight back.
                              e.stopPropagation();
                              handleRowClick(sub.id);
                            }}
                            className={`block w-full cursor-pointer overflow-hidden border-none bg-transparent p-0 text-left text-[13px] font-medium text-ellipsis whitespace-nowrap ${
                              isNamedStudent(sub.student_name)
                                ? "text-zinc-900 dark:text-zinc-100"
                                : "text-zinc-400 italic dark:text-zinc-500"
                            }`}
                          >
                            {studentDisplayName(sub.student_name, t.unnamedStudent)}
                          </button>
                        </th>
                        <td className="px-4 py-3 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                          {fmt.percent(sub.score)}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                          {fmt.date(sub.submission_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-semibold ${pill.bg} ${pill.text}`}
                          >
                            {reviewLabel(sub.review_status)}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                          <td
                            colSpan={4}
                            className="box-border border-t border-t-[var(--brand-200)] bg-[var(--brand-50)] px-4 py-3.5 dark:border-t-[var(--brand-900)] dark:bg-[var(--brand-950)]"
                          >
                      {isLoadingThis ? (
                        <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                          {t.loadingDetails}
                        </p>
                      ) : detailFailed ? (
                        <div
                          role="alert"
                          className="flex flex-wrap items-center gap-3"
                        >
                          <p className="m-0 text-[13px] text-red-700 dark:text-red-400">
                            {t.detailFailed}
                          </p>
                          <button
                            type="button"
                            onClick={() => void fetchDetail(sub.id)}
                            className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                          >
                            {t.retry}
                          </button>
                        </div>
                      ) : detail ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-5">
                            {detail.score != null && (
                              <div>
                                <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                                  {t.detailScore}
                                </span>
                                <span className="text-xl font-bold text-[var(--brand-600)] dark:text-[var(--brand-400)]">
                                  {fmt.percent(detail.score)}
                                </span>
                              </div>
                            )}
                            {detail.review_status && (
                              <div>
                                <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                                  {t.detailReviewStatus}
                                </span>
                                <span
                                  className={`text-[13px] font-semibold ${
                                    reviewPill(detail.review_status).text
                                  }`}
                                >
                                  {reviewLabel(detail.review_status)}
                                </span>
                              </div>
                            )}
                          </div>
                          {detail.feedback && (
                            <div>
                              <span className="mb-1 block text-[11px] text-zinc-400 dark:text-zinc-500">
                                {t.detailFeedback}
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
                          {t.noDetail}
                        </p>
                      )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <LoadMore
            shown={submissions.length}
            total={total}
            paged={paged}
            formatNumber={fmt.number}
          />
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(ExamSubmissions);
