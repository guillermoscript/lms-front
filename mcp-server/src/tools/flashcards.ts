import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Flashcards + SM-2 spaced repetition (Epic #348 Phase 4, issue #355).
 * The host LLM authors cards from lesson material; the SM-2 scheduler decides
 * when each card is due. All state lives in `review_cards` (RLS own-rows) and
 * the SM-2 math runs HERE, deterministically — never delegated to the LLM.
 */

const RATINGS = ["again", "hard", "good", "easy"] as const;
type Rating = (typeof RATINGS)[number];

const MIN_EASE = 1.3;

interface Sm2State {
  ease: number;
  interval_days: number;
  repetitions: number;
}

/**
 * Anki-flavored SM-2. Documented progression (ease 2.5 start):
 *   good:  0d → 1d → 6d → 15d (6*2.5) → 38d ...   ease stays 2.5
 *   easy:  first review 4d, then interval*ease*1.3, ease +0.15 each time
 *   hard:  interval*1.2 (min +1d), ease -0.15, still counts as a repetition
 *   again: repetitions reset to 0, interval 0 (due in 10 minutes), ease -0.20
 * Ease never drops below 1.3.
 */
export function sm2(state: Sm2State, rating: Rating): Sm2State & { dueInMinutes: number } {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const { ease, interval_days, repetitions } = state;

  switch (rating) {
    case "again":
      return {
        ease: round2(Math.max(MIN_EASE, ease - 0.2)),
        interval_days: 0,
        repetitions: 0,
        dueInMinutes: 10,
      };
    case "hard": {
      const interval = repetitions === 0 ? 1 : Math.max(interval_days + 1, Math.round(interval_days * 1.2));
      return {
        ease: round2(Math.max(MIN_EASE, ease - 0.15)),
        interval_days: interval,
        repetitions: repetitions + 1,
        dueInMinutes: interval * 24 * 60,
      };
    }
    case "good": {
      const interval =
        repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.max(interval_days + 1, Math.round(interval_days * ease));
      return {
        ease: round2(ease),
        interval_days: interval,
        repetitions: repetitions + 1,
        dueInMinutes: interval * 24 * 60,
      };
    }
    case "easy": {
      const interval =
        repetitions === 0 ? 4 : Math.max(interval_days + 1, Math.round(interval_days * ease * 1.3));
      return {
        ease: round2(ease + 0.15),
        interval_days: interval,
        repetitions: repetitions + 1,
        dueInMinutes: interval * 24 * 60,
      };
    }
  }
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
        "Save flashcards for the caller's spaced-repetition deck. Author cards from lesson material the student is studying (front = prompt/question, back = answer). New cards are due immediately; the SM-2 scheduler spaces them out as the student reviews. Anchor to a lesson or course when the cards come from one.",
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
        "Fetch the caller's flashcards that are due for review (oldest due first) and open the flip-card review widget. The widget grades each card via SM-2 as the student self-rates Again/Hard/Good/Easy.",
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
          .select("id, front, back, ease, interval_days, repetitions, due_at, course_id, lesson_id", {
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
        "Record a self-rating (again/hard/good/easy) for one of the caller's flashcards. The SM-2 schedule update (ease, interval, next due date) is computed server-side — do not compute it yourself. 'again' makes the card due again in 10 minutes.",
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
          .select("id, ease, interval_days, repetitions")
          .eq("id", input.card_id)
          .eq("user_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();
        if (error) return errorResult(`Loading card: ${error.message}`);
        if (!card) return errorResult(`Card ${input.card_id} not found`);

        const next = sm2(
          {
            ease: Number(card.ease),
            interval_days: card.interval_days as number,
            repetitions: card.repetitions as number,
          },
          input.rating
        );
        const dueAt = new Date(Date.now() + next.dueInMinutes * 60_000).toISOString();

        const { error: updateError } = await supabase
          .from("review_cards")
          .update({
            ease: next.ease,
            interval_days: next.interval_days,
            repetitions: next.repetitions,
            due_at: dueAt,
            last_reviewed_at: new Date().toISOString(),
          })
          .eq("id", input.card_id)
          .eq("user_id", session.getUserId());
        if (updateError) return errorResult(`Updating card: ${updateError.message}`);

        const dueText =
          input.rating === "again"
            ? "due again in 10 minutes"
            : `next review in ${next.interval_days} day(s)`;
        return ok(
          {
            card_id: input.card_id,
            rating: input.rating,
            ease: next.ease,
            interval_days: next.interval_days,
            repetitions: next.repetitions,
            due_at: dueAt,
          },
          `Rated '${input.rating}' — ${dueText} (ease ${next.ease}).`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
