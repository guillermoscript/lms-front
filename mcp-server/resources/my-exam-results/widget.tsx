import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

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
  const colors = {
    bg: dark ? "#0f0f0f" : "#fafafa",
    surface: dark ? "#1a1a1a" : "#ffffff",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    text: dark ? "#f4f4f5" : "#111827",
    textSecondary: dark ? "#a1a1aa" : "#6b7280",
    textMuted: dark ? "#71717a" : "#9ca3af",
    accent: dark ? "#a78bfa" : "#7c3aed",
    pass: dark ? "#4ade80" : "#16a34a",
    passBg: dark ? "#14532d" : "#dcfce7",
    fail: dark ? "#f87171" : "#dc2626",
    failBg: dark ? "#450a0a" : "#fee2e2",
    pendingBg: dark ? "#3f3f46" : "#f4f4f5",
    pendingText: dark ? "#a1a1aa" : "#52525b",
    feedbackBg: dark ? "#141414" : "#f8f7ff",
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
          <p style={{ margin: 0, fontSize: 14 }}>Loading your exam results…</p>
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
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 18,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: colors.text,
              letterSpacing: "-0.02em",
            }}
          >
            My Exam Results
          </h1>
          <span style={{ fontSize: 13, color: colors.textSecondary }}>
            {total} submission{total === 1 ? "" : "s"}
            {average_score !== null ? ` · ${average_score} avg score` : ""}
          </span>
        </div>

        {results.length === 0 ? (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 600, fontSize: 15 }}>
              No exam submissions yet
            </p>
            <p style={{ margin: "6px 0 0", color: colors.textMuted, fontSize: 13 }}>
              Your scores and feedback will appear here after you take an exam.
            </p>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {results.map((r, idx) => {
              const graded = r.score !== null;
              const passed = graded && (r.score ?? 0) >= PASS_THRESHOLD;
              const isOpen = expanded.has(r.submission_id);
              return (
                <div
                  key={r.submission_id}
                  style={{
                    borderBottom:
                      idx === results.length - 1
                        ? "none"
                        : `1px solid ${colors.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "13px 16px",
                      cursor: r.feedback ? "pointer" : "default",
                    }}
                    onClick={() => r.feedback && toggle(r.submission_id)}
                  >
                    {/* Score badge */}
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: 46,
                        textAlign: "center",
                        padding: "5px 8px",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 750,
                        fontVariantNumeric: "tabular-nums",
                        backgroundColor: graded
                          ? passed
                            ? colors.passBg
                            : colors.failBg
                          : colors.pendingBg,
                        color: graded
                          ? passed
                            ? colors.pass
                            : colors.fail
                          : colors.pendingText,
                      }}
                    >
                      {graded ? Math.round(r.score ?? 0) : "—"}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: colors.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.exam_title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: colors.textMuted,
                          marginTop: 2,
                        }}
                      >
                        {r.course_title ? `${r.course_title} · ` : ""}
                        {formatDate(r.submitted_at)}
                        {r.review_status ? ` · ${r.review_status}` : ""}
                      </div>
                    </div>

                    {r.feedback && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 12,
                          color: colors.accent,
                          fontWeight: 600,
                        }}
                      >
                        {isOpen ? "Hide feedback ▲" : "Feedback ▼"}
                      </span>
                    )}
                  </div>

                  {isOpen && r.feedback && (
                    <div
                      style={{
                        margin: "0 16px 13px 74px",
                        padding: "10px 14px",
                        borderRadius: 10,
                        backgroundColor: colors.feedbackBg,
                        border: `1px solid ${colors.border}`,
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: colors.textSecondary,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {r.feedback}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
