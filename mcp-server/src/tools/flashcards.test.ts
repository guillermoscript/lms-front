import { describe, it, expect } from "vitest";
import { gradeCard, cardFromRow } from "./flashcards.js";

/**
 * Characterization tests (issue #549) — these capture current behaviour of
 * `cardFromRow`/`gradeCard` in mcp-server/src/tools/flashcards.ts so a later
 * refactor shows up as a visible test diff. Do NOT change source behaviour
 * to make these pass; if source is wrong, the test documents the bug.
 */

const NOW = new Date("2026-07-26T12:00:00.000Z");

type FsrsRow = Parameters<typeof cardFromRow>[0];

/** A row that has never been through FSRS — the SM-2/pre-migration shape. */
function freshRow(overrides: Partial<FsrsRow> = {}): FsrsRow {
  return {
    interval_days: 0,
    repetitions: 0,
    due_at: NOW.toISOString(),
    last_reviewed_at: null,
    stability: null,
    difficulty: null,
    fsrs_state: 0,
    lapses: 0,
    learning_steps: 0,
    elapsed_days: 0,
    ...overrides,
  };
}

/** A fully FSRS-populated row (as a migration-seeded / previously-graded row would be). */
function populatedRow(overrides: Partial<FsrsRow> = {}): FsrsRow {
  return {
    interval_days: 6,
    repetitions: 3,
    due_at: "2026-07-30T00:00:00.000Z",
    last_reviewed_at: "2026-07-24T00:00:00.000Z",
    stability: 12.34,
    difficulty: 5.67,
    fsrs_state: 2, // Review
    lapses: 1,
    learning_steps: 0,
    elapsed_days: 6,
    ...overrides,
  };
}

describe("cardFromRow", () => {
  it("returns a fresh empty card when stability is null", () => {
    const row = freshRow({ stability: null, difficulty: 5 });
    const card = cardFromRow(row, NOW);
    expect(card.state).toBe(0); // State.New
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.due).toEqual(NOW);
    expect(card.last_review).toBeUndefined();
  });

  it("returns a fresh empty card when difficulty is null", () => {
    const row = freshRow({ stability: 5, difficulty: null });
    const card = cardFromRow(row, NOW);
    expect(card.state).toBe(0); // State.New
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.due).toEqual(NOW);
    expect(card.last_review).toBeUndefined();
  });

  it("returns a fresh empty card when both stability and difficulty are null", () => {
    const row = freshRow();
    const card = cardFromRow(row, NOW);
    expect(card.state).toBe(0);
    expect(card.due).toEqual(NOW);
  });

  it("round-trips a fully populated row onto the Card", () => {
    const row = populatedRow();
    const card = cardFromRow(row, NOW);
    expect(card.stability).toBe(row.stability);
    expect(card.difficulty).toBe(row.difficulty);
    expect(card.reps).toBe(row.repetitions);
    expect(card.lapses).toBe(row.lapses);
    expect(card.state).toBe(row.fsrs_state);
    expect(card.scheduled_days).toBe(row.interval_days);
    expect(card.elapsed_days).toBe(row.elapsed_days);
    expect(card.learning_steps).toBe(row.learning_steps);
    expect(card.due).toEqual(new Date(row.due_at));
    expect(card.last_review).toEqual(new Date(row.last_reviewed_at as string));
  });

  it("falls back to `now` for last_review when last_reviewed_at is null", () => {
    const row = populatedRow({ last_reviewed_at: null });
    const card = cardFromRow(row, NOW);
    expect(card.last_review).toEqual(NOW);
  });
});

describe("gradeCard", () => {
  const ratings = ["again", "hard", "good", "easy"] as const;

  it.each(ratings)("returns the full persisted-row shape for rating '%s' on a New card", (rating) => {
    const row = freshRow();
    const result = gradeCard(row, rating, NOW);

    expect(result).toMatchObject({
      stability: expect.any(Number),
      difficulty: expect.any(Number),
      fsrs_state: expect.any(Number),
      lapses: expect.any(Number),
      learning_steps: expect.any(Number),
      elapsed_days: expect.any(Number),
      interval_days: expect.any(Number),
      repetitions: expect.any(Number),
      due_at: expect.any(String),
      last_reviewed_at: expect.any(String),
    });

    // due_at / last_reviewed_at are ISO strings.
    expect(new Date(result.due_at).toISOString()).toBe(result.due_at);
    expect(new Date(result.last_reviewed_at).toISOString()).toBe(result.last_reviewed_at);
    expect(result.last_reviewed_at).toBe(NOW.toISOString());
  });

  it("orders scheduling further out as rating improves: again < hard < good < easy", () => {
    const row = freshRow();
    const again = gradeCard(row, "again", NOW);
    const hard = gradeCard(row, "hard", NOW);
    const good = gradeCard(row, "good", NOW);
    const easy = gradeCard(row, "easy", NOW);

    const t = (r: ReturnType<typeof gradeCard>) => new Date(r.due_at).getTime();

    expect(t(again)).toBeLessThanOrEqual(t(hard));
    expect(t(hard)).toBeLessThanOrEqual(t(good));
    expect(t(good)).toBeLessThan(t(easy));
  });

  it("rating 'again' on an established Review-state card increments lapses", () => {
    const row = populatedRow({ fsrs_state: 2, lapses: 1 });
    const result = gradeCard(row, "again", NOW);
    expect(result.lapses).toBe(2);
  });

  it("BUG (#549 §4): a 'lapsed' row (repetitions/interval reset but stability/difficulty null) currently grades as a brand-new card, discarding history", () => {
    // This row represents history that was reset to null stability/difficulty
    // (e.g. a lapse-tracking path) while repetitions/interval_days/last_reviewed_at
    // still carry prior state. Because cardFromRow() only checks
    // stability===null || difficulty===null, this row is treated as a
    // never-seen card: FSRS starts a brand-new learning card, and prior
    // repetitions/interval history is silently discarded. Asserting today's
    // (buggy) behaviour here — do NOT "fix" the source to make this pass.
    const lapsedRow = freshRow({
      repetitions: 0,
      interval_days: 0,
      last_reviewed_at: "2026-07-20T00:00:00.000Z",
      stability: null,
      difficulty: null,
    });

    const card = cardFromRow(lapsedRow, NOW);
    // Discards history: comes back as a brand-new createEmptyCard(now) — the
    // null-stability/difficulty check short-circuits BEFORE the
    // last_reviewed_at fallback logic even runs, so last_review is left
    // `undefined` (createEmptyCard's default), not `now` and not the row's
    // real last_reviewed_at.
    expect(card.state).toBe(0); // State.New
    expect(card.reps).toBe(0);
    expect(card.last_review).toBeUndefined();

    const result = gradeCard(lapsedRow, "good", NOW);
    // A brand-new "good" grade produces the same result whether or not the
    // row had prior repetitions — because cardFromRow() throws that history away.
    const freshResult = gradeCard(freshRow(), "good", NOW);
    expect(result).toEqual(freshResult);
  });
});
