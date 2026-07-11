import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// Props produced by lms_get_due_reviews (Epic #348 Phase 4, #355).
const propsSchema = z.object({
  cards: z
    .array(
      z.object({
        id: z.number(),
        front: z.string(),
        back: z.string(),
        repetitions: z.number(),
        interval_days: z.number(),
      })
    )
    .describe("Due cards for this session, oldest due first"),
  total_due: z.number().describe("Total cards due (may exceed the session batch)"),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Flashcard review session: flip cards, self-rate Again/Hard/Good/Easy (SM-2 scheduled server-side), with an end-of-session summary.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Gathering your due cards...",
    invoked: "Review session ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Rating = "again" | "hard" | "good" | "easy";

const RATING_META: Array<{ rating: Rating; label: string; hint: string }> = [
  { rating: "again", label: "Again", hint: "<10m" },
  { rating: "hard", label: "Hard", hint: "" },
  { rating: "good", label: "Good", hint: "" },
  { rating: "easy", label: "Easy", hint: "" },
];

export default function Flashcards() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const { callTool } = useCallTool("lms_grade_review");
  const theme = useWidgetTheme();
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
    warn: dark ? "#fbbf24" : "#d97706",
    fail: dark ? "#f87171" : "#dc2626",
  };
  const ratingColor: Record<Rating, string> = {
    again: colors.fail,
    hard: colors.warn,
    good: colors.pass,
    easy: colors.accent,
  };

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [counts, setCounts] = useState<Record<Rating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const [againFronts, setAgainFronts] = useState<string[]>([]);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
            padding: 40,
            display: "flex",
            justifyContent: "center",
            backgroundColor: colors.bg,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: `3px solid ${colors.border}`,
              borderTopColor: colors.accent,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </McpUseProvider>
    );
  }

  const { cards, total_due } = props;
  const card = cards[index];
  const reviewed = index;
  const finished = index >= cards.length;

  const rate = (rating: Rating) => {
    if (!card) return;
    // Fire-and-forget: SM-2 scheduling happens server-side; the session
    // advances immediately so the flow stays snappy.
    callTool({ card_id: card.id, rating });
    setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
    if (rating === "again") setAgainFronts((f) => [...f, card.front]);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const container: React.CSSProperties = {
    fontFamily: "system-ui, -apple-system, sans-serif",
    backgroundColor: colors.bg,
    padding: 24,
    maxWidth: 560,
    margin: "0 auto",
  };

  if (cards.length === 0) {
    return (
      <McpUseProvider autoSize>
        <div style={container}>
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 600, fontSize: 15 }}>
              Deck clear — nothing due
            </p>
            <p style={{ margin: "6px 0 0", color: colors.textMuted, fontSize: 13 }}>
              Ask the tutor to make flashcards from what you're studying.
            </p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  if (finished) {
    const summary =
      `Reviewed ${cards.length} cards: ` +
      RATING_META.map((r) => `${counts[r.rating]} ${r.label}`).join(", ") +
      (againFronts.length > 0
        ? `. The ones I rated Again: ${againFronts
            .map((f) => `"${f}"`)
            .join(", ")} — quiz me on those.`
        : ". All comfortable — what should I tackle next?");
    return (
      <McpUseProvider autoSize>
        <div style={container}>
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              {counts.again > 0 ? "💪" : "🏆"}
            </div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 700, fontSize: 16 }}>
              Session done — {cards.length} card{cards.length === 1 ? "" : "s"} reviewed
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "center",
                flexWrap: "wrap",
                margin: "14px 0 4px",
              }}
            >
              {RATING_META.map((r) => (
                <span
                  key={r.rating}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: `1px solid ${ratingColor[r.rating]}`,
                    color: ratingColor[r.rating],
                  }}
                >
                  {r.label}: {counts[r.rating]}
                </span>
              ))}
            </div>
            {againFronts.length > 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: colors.textSecondary }}>
                Tricky: {againFronts.join(" · ")}
              </p>
            )}
            <button
              onClick={() => sendFollowUpMessage(summary)}
              style={{
                marginTop: 18,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "#ffffff",
                backgroundColor: colors.accent,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {againFronts.length > 0 ? "Drill my misses" : "What's next?"}
            </button>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div style={container}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>
            Card {index + 1} of {cards.length}
            {total_due > cards.length ? ` (${total_due} due)` : ""}
          </span>
          <span style={{ fontSize: 12, color: colors.textMuted }}>
            {card.repetitions === 0
              ? "new card"
              : `seen ${card.repetitions}×, last interval ${card.interval_days}d`}
          </span>
        </div>

        <div
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: dark ? "#27272a" : "#f3f4f6",
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: `${Math.round((reviewed / cards.length) * 100)}%`,
              height: "100%",
              backgroundColor: colors.accent,
              borderRadius: 2,
            }}
          />
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${flipped ? colors.accent : colors.border}`,
            borderRadius: 12,
            padding: "36px 28px",
            minHeight: 120,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: flipped ? colors.accent : colors.textMuted,
              marginBottom: 10,
            }}
          >
            {flipped ? "Answer" : "Prompt"}
          </span>
          <span style={{ fontSize: 17, fontWeight: 600, color: colors.text, lineHeight: 1.45 }}>
            {flipped ? card.back : card.front}
          </span>
          {!flipped && (
            <span style={{ marginTop: 14, fontSize: 12, color: colors.textMuted }}>
              Click or press space to reveal
            </span>
          )}
        </div>

        {flipped && (
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {RATING_META.map((r) => (
              <button
                key={r.rating}
                onClick={() => rate(r.rating)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 13,
                  fontWeight: 700,
                  color: ratingColor[r.rating],
                  backgroundColor: "transparent",
                  border: `1px solid ${ratingColor[r.rating]}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {r.label}
                {r.hint && (
                  <span style={{ display: "block", fontSize: 10, fontWeight: 500 }}>
                    {r.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
