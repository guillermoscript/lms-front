import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { text } from "mcp-use";
// `viewResult` narrows the deprecated widget() helper's return type so it
// satisfies v2's compile-time outputSchema enforcement (see format.ts).
import { viewResult as widget } from "../format.js";
import { REVIEW_RATINGS, gradeReviewCard, getDueReviewCards } from "@lms/core";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";
import { propsSchema as flashcardsPropsSchema } from "../../views/flashcards/schema.js";

/**
 * Flashcards + FSRS spaced repetition (Epic #348 Phase 4, issue #355;
 * FSRS scheduler swap in Epic #388, issue #389).
 * The host LLM authors cards from lesson material; the FSRS scheduler decides
 * when each card is due. All state lives in `review_cards` (RLS own-rows) and
 * the scheduling math is ts-fsrs in `@lms/core` (#849) — the same code the web
 * review session and the native app grade with — deterministically, never
 * delegated to the LLM.
 */

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

export function registerFlashcardTools(server: LmsServer) {
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
      outputSchema: flashcardsPropsSchema,
      view: { name: "flashcards" },
      _meta: {
        "openai/toolInvocation/invoking": "Gathering your due cards...",
        "openai/toolInvocation/invoked": "Review session ready",
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
        const { data, error, count } = await getDueReviewCards(
          session.getClient(),
          session.getUserId(),
          session.getTenantId(),
          limit
        );
        if (error) return errorResult(`Loading due cards: ${error.message}`);

        const cards = (data ?? []).map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
          repetitions: c.repetitions,
          interval_days: c.interval_days,
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
          .enum(REVIEW_RATINGS)
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
        const now = new Date();
        const graded = await gradeReviewCard(
          session.getClient(),
          session.getUserId(),
          session.getTenantId(),
          input.card_id,
          input.rating,
          now
        );
        if (!graded.ok) return errorResult(graded.message);
        const { next } = graded;

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
