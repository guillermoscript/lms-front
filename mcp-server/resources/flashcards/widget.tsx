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

// Border + text classes per rating (fail / warn / pass / accent).
const ratingColor: Record<Rating, string> = {
  again: "border-red-600 text-red-600 dark:border-red-400 dark:text-red-400",
  hard: "border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400",
  good: "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400",
  easy: "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400",
};

export default function Flashcards() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const { callTool } = useCallTool("lms_grade_review");
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [counts, setCounts] = useState<Record<Rating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const [againFronts, setAgainFronts] = useState<string[]>([]);
  const [failedSaves, setFailedSaves] = useState(0);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="flex justify-center bg-zinc-50 p-10 font-sans dark:bg-zinc-950">
            <div className="size-6 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
          </div>
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
    // The session advances immediately so the flow stays snappy; SM-2
    // scheduling happens server-side. Failures surface as a session notice.
    callTool(
      { card_id: card.id, rating },
      { onError: () => setFailedSaves((n) => n + 1) }
    );
    setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
    if (rating === "again") setAgainFronts((f) => [...f, card.front]);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const container = "mx-auto max-w-[560px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950";

  if (cards.length === 0) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className={container}>
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-[32px]">🎉</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                Deck clear — nothing due
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                Ask the tutor to make flashcards from what you're studying.
              </p>
            </div>
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
        <div className={dark ? "dark" : ""}>
          <div className={container}>
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-[32px]">
                {counts.again > 0 ? "💪" : "🏆"}
              </div>
              <p className="m-0 text-base font-bold text-zinc-900 dark:text-zinc-100">
                Session done — {cards.length} card{cards.length === 1 ? "" : "s"} reviewed
              </p>
              <div className="mx-0 mt-3.5 mb-1 flex flex-wrap justify-center gap-2">
                {RATING_META.map((r) => (
                  <span
                    key={r.rating}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ratingColor[r.rating]}`}
                  >
                    {r.label}: {counts[r.rating]}
                  </span>
                ))}
              </div>
              {againFronts.length > 0 && (
                <p className="mt-2.5 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                  Tricky: {againFronts.join(" · ")}
                </p>
              )}
              {failedSaves > 0 && (
                <p className="mt-2.5 mb-0 text-xs text-red-600 dark:text-red-400">
                  {failedSaves} rating{failedSaves === 1 ? "" : "s"} failed to save —
                  those cards will stay due.
                </p>
              )}
              <button
                onClick={() => sendFollowUpMessage(summary)}
                className="mt-4.5 cursor-pointer rounded-lg border-none bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white dark:bg-violet-400"
              >
                {againFronts.length > 0 ? "Drill my misses" : "What's next?"}
              </button>
            </div>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className={container}>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
              Card {index + 1} of {cards.length}
              {total_due > cards.length ? ` (${total_due} due)` : ""}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {card.repetitions === 0
                ? "new card"
                : `seen ${card.repetitions}×, last interval ${card.interval_days}d`}
            </span>
          </div>

          <div className="mb-4 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-violet-600 dark:bg-violet-400"
              style={{ width: `${Math.round((reviewed / cards.length) * 100)}%` }}
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
            className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border bg-white px-7 py-9 text-center select-none dark:bg-zinc-900 ${
              flipped
                ? "border-violet-600 dark:border-violet-400"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <span
              className={`mb-2.5 text-[11px] font-bold tracking-[1px] uppercase ${
                flipped
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {flipped ? "Answer" : "Prompt"}
            </span>
            <div className="w-full text-left font-semibold break-words">
              <Markdown
                content={flipped ? card.back : card.front}
                dark={dark}
                fontSize={16}
              />
            </div>
            {!flipped && (
              <span className="mt-3.5 text-xs text-zinc-400 dark:text-zinc-500">
                Click or press space to reveal
              </span>
            )}
          </div>

          {failedSaves > 0 && (
            <p className="mt-2.5 mb-0 text-xs text-red-600 dark:text-red-400">
              {failedSaves} rating{failedSaves === 1 ? "" : "s"} failed to save —
              those cards will stay due.
            </p>
          )}

          {flipped && (
            <div className="mt-3.5 flex gap-2">
              {RATING_META.map((r) => (
                <button
                  key={r.rating}
                  onClick={() => rate(r.rating)}
                  className={`flex-1 cursor-pointer rounded-lg border bg-transparent px-0 py-2.5 text-[13px] font-bold ${ratingColor[r.rating]}`}
                >
                  {r.label}
                  {r.hint && (
                    <span className="block text-[10px] font-medium">{r.hint}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
