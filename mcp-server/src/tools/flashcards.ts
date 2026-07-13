import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  type Card,
  type Grade,
  type State,
} from "ts-fsrs";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Flashcards + FSRS spaced repetition (Epic #348 Phase 4, issue #355;
 * FSRS scheduler swap in Epic #388, issue #389).
 * The host LLM authors cards from lesson material; the FSRS scheduler decides
 * when each card is due. All state lives in `review_cards` (RLS own-rows) and
 * the scheduling math runs HERE via ts-fsrs, deterministically — never
 * delegated to the LLM. The legacy SM-2 `ease` column is kept but no longer
 * read or written; cards migrated from SM-2 get their FSRS state seeded by
 * the 20260713120000_add_fsrs_to_review_cards migration.
 */

const RATINGS = ["again", "hard", "good", "easy"] as const;
type Rating = (typeof RATINGS)[number];

const RATING_TO_FSRS: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

/** Default parameters, 90% desired retention — do not hand-roll FSRS math. */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9 }));

/** review_cards columns that carry FSRS state (some reused from SM-2 days). */
interface FsrsRow {
  interval_days: number;
  repetitions: number;
  due_at: string;
  last_reviewed_at: string | null;
  stability: number | null;
  difficulty: number | null;
  fsrs_state: number;
  lapses: number;
  learning_steps: number;
  elapsed_days: number;
}

/**
 * Rebuild a ts-fsrs Card from a review_cards row. Rows the migration couldn't
 * seed (never reviewed, or created before FSRS with no history) are new cards.
 */
export function cardFromRow(row: FsrsRow, now: Date): Card {
  if (row.stability === null || row.difficulty === null) {
    return createEmptyCard(now);
  }
  return {
    due: new Date(row.due_at),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.interval_days,
    learning_steps: row.learning_steps,
    reps: row.repetitions,
    lapses: row.lapses,
    state: row.fsrs_state as State,
    // Migration-seeded rows always have last_reviewed_at (every grade wrote
    // it); fall back to "just now" so elapsed time can never go negative.
    last_review: row.last_reviewed_at ? new Date(row.last_reviewed_at) : now,
  };
}

/** Grade one card with FSRS and return the row fields to persist. */
export function gradeCard(row: FsrsRow, rating: Rating, now: Date) {
  const { card } = scheduler.next(cardFromRow(row, now), now, RATING_TO_FSRS[rating]);
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    fsrs_state: card.state as number,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    elapsed_days: card.elapsed_days,
    interval_days: card.scheduled_days,
    repetitions: card.reps,
    due_at: card.due.toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

/** lesson_id wins — the lesson's course is authoritative (same rule as practice). */
async function resolveCardCourse(
  session: LmsSession,
  input: { course_id?: number; lesson_id?: number }
): Promise<number | null> {
  if (input.lesson_id !== undefined) {
    const { data, error } = await session
      .getClient()
      .from("lessons")
      .select("course_id")
      .eq("id", input.lesson_id)
      .eq("tenant_id", session.getTenantId())
      .maybeSingle();
    if (error) throw new Error(`Loading lesson: ${error.message}`);
    if (!data) throw new Error(`Lesson ${input.lesson_id} not found`);
    return data.course_id as number;
  }
  return input.course_id ?? null;
}

export function registerFlashcardTools(server: MCPServer) {
  // ── lms_create_review_cards ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_review_cards",
      description:
        "Save flashcards for the caller's spaced-repetition deck. Author cards from lesson material the student is studying (front = prompt/question, back = answer). New cards are due immediately; the FSRS scheduler spaces them out as the student reviews. Anchor to a lesson or course when the cards come from one.",
      schema: z.object({
        course_id: z
          .number()
          .optional()
          .describe("Course these cards belong to (optional)"),
        lesson_id: z
          .number()
          .optional()
          .describe("Lesson these cards were authored from (optional; wins over course_id for the access check)"),
        cards: z
          .array(
            z.object({
              front: z.string().min(1).max(500).describe("Card front: the prompt or question"),
              back: z.string().min(1).max(2000).describe("Card back: the answer"),
            })
          )
          .min(1)
          .max(30)
          .describe("1-30 cards to create"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const courseId = await resolveCardCourse(session, input);
        if (courseId !== null) await session.verifyCourseAccess(courseId);

        const rows = input.cards.map((c) => ({
          user_id: session.getUserId(),
          tenant_id: session.getTenantId(),
          course_id: courseId,
          lesson_id: input.lesson_id ?? null,
          front: c.front,
          back: c.back,
        }));

        const { data, error } = await session
          .getClient()
          .from("review_cards")
          .insert(rows)
          .select("id");
        if (error) return errorResult(`Creating cards: ${error.message}`);

        return ok(
          { created: data?.length ?? 0, card_ids: (data ?? []).map((r) => r.id) },
          `Created ${data?.length ?? 0} flashcard(s). They are due now — use lms_get_due_reviews to start a review session.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_due_reviews ─────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_due_reviews",
      description:
        "Fetch the caller's flashcards that are due for review (oldest due first) and open the flip-card review widget. The widget grades each card via FSRS as the student self-rates Again/Hard/Good/Easy.",
      schema: z.object({
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max cards for this session (default 20)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "flashcards",
        invoking: "Gathering your due cards...",
        invoked: "Review session ready",
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const limit = input.limit ?? 20;
        const { data, error, count } = await session
          .getClient()
          .from("review_cards")
          .select("id, front, back, interval_days, repetitions, due_at, course_id, lesson_id", {
            count: "exact",
          })
          .eq("user_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .eq("suspended", false)
          .lte("due_at", new Date().toISOString())
          .order("due_at", { ascending: true })
          .limit(limit);
        if (error) return errorResult(`Loading due cards: ${error.message}`);

        const cards = (data ?? []).map((c) => ({
          id: c.id as number,
          front: c.front as string,
          back: c.back as string,
          repetitions: c.repetitions as number,
          interval_days: c.interval_days as number,
        }));

        return widget({
          props: { cards, total_due: count ?? cards.length },
          output: text(
            cards.length === 0
              ? "No cards due — the deck is clear. Use lms_create_review_cards to add cards from material the student is studying."
              : `${count ?? cards.length} card(s) due; showing ${cards.length}. The widget records each self-rating via lms_grade_review.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_grade_review ────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_grade_review",
      description:
        "Record a self-rating (again/hard/good/easy) for one of the caller's flashcards. The FSRS schedule update (stability, difficulty, next due date) is computed server-side — do not compute it yourself. 'again' makes the card due again within minutes.",
      schema: z.object({
        card_id: z.number().describe("The review card ID being rated"),
        rating: z
          .enum(RATINGS)
          .describe("Student's self-rating after seeing the back of the card"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();
        const { data: card, error } = await supabase
          .from("review_cards")
          .select(
            "id, interval_days, repetitions, due_at, last_reviewed_at, stability, difficulty, fsrs_state, lapses, learning_steps, elapsed_days"
          )
          .eq("id", input.card_id)
          .eq("user_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();
        if (error) return errorResult(`Loading card: ${error.message}`);
        if (!card) return errorResult(`Card ${input.card_id} not found`);

        const now = new Date();
        const next = gradeCard(card as FsrsRow, input.rating, now);

        const { error: updateError } = await supabase
          .from("review_cards")
          .update(next)
          .eq("id", input.card_id)
          .eq("user_id", session.getUserId());
        if (updateError) return errorResult(`Updating card: ${updateError.message}`);

        const dueInMinutes = Math.max(1, Math.round((Date.parse(next.due_at) - now.getTime()) / 60_000));
        const dueText =
          dueInMinutes < 24 * 60
            ? `due again in ${dueInMinutes} minute(s)`
            : `next review in ${next.interval_days} day(s)`;
        return ok(
          {
            card_id: input.card_id,
            rating: input.rating,
            interval_days: next.interval_days,
            repetitions: next.repetitions,
            due_at: next.due_at,
            stability: Math.round(next.stability * 100) / 100,
            difficulty: Math.round(next.difficulty * 100) / 100,
          },
          `Rated '${input.rating}' — ${dueText}.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
