import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

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

function reviewPill(
  status: string | null,
  theme: "light" | "dark"
): { bg: string; text: string } {
  const dark = theme === "dark";
  switch ((status ?? "pending").toLowerCase()) {
    case "approved":
    case "graded":
      return { bg: dark ? "#14532d" : "#dcfce7", text: dark ? "#86efac" : "#166534" };
    case "rejected":
    case "failed":
      return { bg: dark ? "#7f1d1d" : "#fee2e2", text: dark ? "#fca5a5" : "#991b1b" };
    case "pending":
    default:
      return { bg: dark ? "#422006" : "#fef3c7", text: dark ? "#fcd34d" : "#92400e" };
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

  const colors = {
    bg: dark ? "#0f0f0f" : "#fafafa",
    surface: dark ? "#1a1a1a" : "#ffffff",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    text: dark ? "#f4f4f5" : "#111827",
    textSecondary: dark ? "#a1a1aa" : "#6b7280",
    textMuted: dark ? "#71717a" : "#9ca3af",
    accent: dark ? "#a78bfa" : "#7c3aed",
    rowHover: dark ? "#222222" : "#f9fafb",
    rowExpanded: dark ? "#1e1b2e" : "#faf5ff",
    detailBg: dark ? "#161616" : "#f5f3ff",
    detailBorder: dark ? "#3d2e6b" : "#ddd6fe",
    headerBg: dark ? "#141414" : "#f3f4f6",
  };

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: colors.textMuted,
            backgroundColor: colors.bg,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: `3px solid ${colors.border}`,
              borderTop: `3px solid ${colors.accent}`,
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: 14 }}>Loading submissions…</p>
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
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: colors.text,
              letterSpacing: "-0.01em",
            }}
          >
            Exam #{exam_id} — Submissions
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: colors.textSecondary }}>
            {total} submission{total !== 1 ? "s" : ""} · Click a row to see details
          </p>
        </div>

        {/* Table */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 120px 100px",
              gap: 0,
              backgroundColor: colors.headerBg,
              borderBottom: `1px solid ${colors.border}`,
              padding: "9px 16px",
            }}
          >
            {["Student", "Score", "Date", "Status"].map((col) => (
              <span
                key={col}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {col}
              </span>
            ))}
          </div>

          {/* Empty state */}
          {submissions.length === 0 && (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: colors.textMuted,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <p style={{ margin: 0, fontSize: 14 }}>No submissions yet</p>
            </div>
          )}

          {/* Data rows */}
          {submissions.map((sub, idx) => {
            const pill = reviewPill(sub.review_status, theme);
            const isExpanded = expandedId === sub.id;
            const isLoadingThis = loadingId === sub.id;
            const detail = detailMap[sub.id];
            const isLast = idx === submissions.length - 1 && !isExpanded;

            return (
              <div key={sub.id}>
                <div
                  onClick={() => handleRowClick(sub.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 120px 100px",
                    gap: 0,
                    padding: "12px 16px",
                    borderBottom: isLast ? "none" : `1px solid ${colors.border}`,
                    backgroundColor: isExpanded ? colors.rowExpanded : "transparent",
                    cursor: "pointer",
                    transition: "background-color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded)
                      (e.currentTarget as HTMLDivElement).style.backgroundColor =
                        colors.rowHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded)
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: colors.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sub.student_name}
                  </span>
                  <span style={{ fontSize: 13, color: colors.text, fontWeight: 600 }}>
                    {sub.score != null ? `${sub.score}%` : "—"}
                  </span>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>
                    {formatDate(sub.submission_date)}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: pill.bg,
                        color: pill.text,
                      }}
                    >
                      {sub.review_status ?? "pending"}
                    </span>
                  </span>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "14px 16px",
                      backgroundColor: colors.detailBg,
                      borderTop: `1px solid ${colors.detailBorder}`,
                      borderBottom:
                        idx === submissions.length - 1
                          ? "none"
                          : `1px solid ${colors.border}`,
                    }}
                  >
                    {isLoadingThis ? (
                      <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
                        Loading details…
                      </p>
                    ) : detail ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                          {detail.score != null && (
                            <div>
                              <span
                                style={{ fontSize: 11, color: colors.textMuted, display: "block" }}
                              >
                                Score
                              </span>
                              <span
                                style={{
                                  fontSize: 20,
                                  fontWeight: 700,
                                  color: colors.accent,
                                }}
                              >
                                {detail.score}%
                              </span>
                            </div>
                          )}
                          {detail.review_status && (
                            <div>
                              <span
                                style={{ fontSize: 11, color: colors.textMuted, display: "block" }}
                              >
                                Review status
                              </span>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: reviewPill(detail.review_status, theme).text,
                                }}
                              >
                                {detail.review_status}
                              </span>
                            </div>
                          )}
                        </div>
                        {detail.feedback && (
                          <div>
                            <span
                              style={{
                                fontSize: 11,
                                color: colors.textMuted,
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              Feedback
                            </span>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 13,
                                color: colors.textSecondary,
                                lineHeight: 1.6,
                              }}
                            >
                              {detail.feedback}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
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
    </McpUseProvider>
  );
}
