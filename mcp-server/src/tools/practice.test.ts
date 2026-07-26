import { describe, it, expect } from "vitest";
import {
  blockedInterleavingTopics,
  computeInterleavingPool,
  eloExpected,
  eloJitter,
} from "./practice.js";

/**
 * Characterization tests (issue #549) — capture current behaviour of
 * `computeInterleavingPool`, `eloExpected`, and `eloJitter` in
 * mcp-server/src/tools/practice.ts so a later refactor shows up as a visible
 * test diff. Do NOT change source behaviour to make these pass.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp `daysAgo` days before now (relative, so tests don't rot). */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

describe("computeInterleavingPool", () => {
  it("marks a topic ready once it has >= 2 passing (>=70) attempts within 90 days", () => {
    const rows = [
      { topic: "algebra", score: 80, created_at: daysAgo(1) },
      { topic: "algebra", score: 75, created_at: daysAgo(2) },
    ];
    const pool = computeInterleavingPool(rows);
    const stat = pool.get("algebra");
    expect(stat).toBeDefined();
    expect(stat!.ready).toBe(true);
    expect(stat!.passing_attempts).toBe(2);
    expect(stat!.attempts_counted).toBe(2);
  });

  it("does not mark a topic ready with only 1 passing attempt", () => {
    const rows = [{ topic: "algebra", score: 80, created_at: daysAgo(1) }];
    const pool = computeInterleavingPool(rows);
    const stat = pool.get("algebra")!;
    expect(stat.ready).toBe(false);
    expect(stat.passing_attempts).toBe(1);
    expect(stat.attempts_counted).toBe(1);
  });

  it("is present but not ready when 2 attempts both score below 70, with correct counts", () => {
    const rows = [
      { topic: "algebra", score: 50, created_at: daysAgo(1) },
      { topic: "algebra", score: 60, created_at: daysAgo(2) },
    ];
    const pool = computeInterleavingPool(rows);
    const stat = pool.get("algebra")!;
    expect(stat.ready).toBe(false);
    expect(stat.passing_attempts).toBe(0);
    expect(stat.attempts_counted).toBe(2);
    expect(stat.avg_score).toBe(55);
  });

  it("excludes rows older than the 90-day window entirely — a topic with only stale rows is absent", () => {
    const rows = [
      { topic: "geometry", score: 90, created_at: daysAgo(91) },
      { topic: "geometry", score: 95, created_at: daysAgo(120) },
    ];
    const pool = computeInterleavingPool(rows);
    expect(pool.has("geometry")).toBe(false);
    expect(pool.size).toBe(0);
  });

  it("rounds avg_score and averages over ALL in-window attempts, not just passing ones", () => {
    const rows = [
      { topic: "calculus", score: 100, created_at: daysAgo(1) }, // passing
      { topic: "calculus", score: 90, created_at: daysAgo(2) }, // passing
      { topic: "calculus", score: 40, created_at: daysAgo(3) }, // failing, still counted in avg
    ];
    const pool = computeInterleavingPool(rows);
    const stat = pool.get("calculus")!;
    expect(stat.attempts_counted).toBe(3);
    expect(stat.passing_attempts).toBe(2);
    // (100 + 90 + 40) / 3 = 76.666... -> rounds to 77
    expect(stat.avg_score).toBe(77);
    expect(stat.ready).toBe(true);
  });

  it("handles scores arriving as strings (Number(row.score) coercion)", () => {
    const rows = [
      { topic: "physics", score: "80" as unknown as number, created_at: daysAgo(1) },
      { topic: "physics", score: "75" as unknown as number, created_at: daysAgo(2) },
    ];
    const pool = computeInterleavingPool(rows);
    const stat = pool.get("physics")!;
    expect(stat.passing_attempts).toBe(2);
    expect(stat.ready).toBe(true);
    expect(stat.avg_score).toBe(78); // (80+75)/2 = 77.5 -> rounds to 78
  });

  it("returns an empty Map for no rows", () => {
    const pool = computeInterleavingPool([]);
    expect(pool.size).toBe(0);
  });

  it("tracks multiple topics independently", () => {
    const rows = [
      { topic: "algebra", score: 90, created_at: daysAgo(1) },
      { topic: "algebra", score: 90, created_at: daysAgo(2) },
      { topic: "geometry", score: 30, created_at: daysAgo(1) },
    ];
    const pool = computeInterleavingPool(rows);
    expect(pool.size).toBe(2);
    expect(pool.get("algebra")!.ready).toBe(true);
    expect(pool.get("geometry")!.ready).toBe(false);
  });
});

describe("eloExpected", () => {
  it("returns exactly 0.5 for equal ratings", () => {
    expect(eloExpected(1500, 1500)).toBe(0.5);
  });

  it("returns ~0.909 for a 400-point student advantage", () => {
    expect(eloExpected(1900, 1500)).toBeCloseTo(0.9091, 3);
  });

  it("returns ~0.0909 for a 400-point student deficit", () => {
    expect(eloExpected(1100, 1500)).toBeCloseTo(0.0909, 3);
  });

  it("is symmetric: eloExpected(a,b) + eloExpected(b,a) === 1", () => {
    const a = 1620;
    const b = 1430;
    expect(eloExpected(a, b) + eloExpected(b, a)).toBeCloseTo(1, 10);
  });

  it("is monotonic: a higher student rating strictly increases the result", () => {
    const item = 1500;
    const lower = eloExpected(1400, item);
    const higher = eloExpected(1600, item);
    expect(higher).toBeGreaterThan(lower);
  });
});

describe("eloJitter", () => {
  it("is deterministic: the same id always returns the same value", () => {
    expect(eloJitter(42)).toBe(eloJitter(42));
    expect(eloJitter(123456)).toBe(eloJitter(123456));
  });

  it("is bounded within [-0.03, 0.03] across hundreds of ids", () => {
    for (let id = 0; id < 500; id++) {
      const j = eloJitter(id);
      expect(j).toBeGreaterThanOrEqual(-0.03);
      expect(j).toBeLessThan(0.03);
    }
  });

  it("produces different values for different ids (not a constant)", () => {
    const values = [1, 2, 3, 4, 5, 100, 999, 123456].map(eloJitter);
    const distinct = new Set(values);
    expect(distinct.size).toBeGreaterThan(1);
  });
});

/**
 * The shared mastery-gate decision (issue #549 §5). Both lms_practice_quiz and
 * lms_record_practice_attempt route through this, so the rendered session and
 * the stored session can never disagree about what is allowed — before #549
 * only the quiz tool gated at all, and the record tool (which its own
 * description tells the model to call directly for free-text and chat/voice
 * drills) wrote the very rows the gate later reads back to decide readiness.
 */
describe("blockedInterleavingTopics", () => {
  const pool = computeInterleavingPool([
    // "loops" clears the gate: 2 attempts >= 70 inside the 90-day window.
    { topic: "loops", score: 90, created_at: daysAgo(5) },
    { topic: "loops", score: 75, created_at: daysAgo(3) },
    // "recursion" has only one passing attempt.
    { topic: "recursion", score: 95, created_at: daysAgo(4) },
    // "pointers" has two attempts, both failing.
    { topic: "pointers", score: 40, created_at: daysAgo(6) },
    { topic: "pointers", score: 55, created_at: daysAgo(2) },
  ]);

  it("blocks nothing when every topic is interleaving-ready", () => {
    expect(blockedInterleavingTopics(["loops"], pool)).toEqual([]);
  });

  it("blocks a topic with only one passing attempt", () => {
    expect(blockedInterleavingTopics(["recursion"], pool)).toEqual(["recursion"]);
  });

  it("blocks a topic whose attempts all scored below the gate", () => {
    expect(blockedInterleavingTopics(["pointers"], pool)).toEqual(["pointers"]);
  });

  it("blocks a topic with no history at all — an unknown topic is never ready", () => {
    expect(blockedInterleavingTopics(["never-practised"], pool)).toEqual([
      "never-practised",
    ]);
  });

  it("returns every blocked topic in a mixed set, and only those", () => {
    expect(
      blockedInterleavingTopics(["loops", "recursion", "pointers"], pool)
    ).toEqual(["recursion", "pointers"]);
  });

  it("accepts a Set, which is what the tools actually pass", () => {
    const topics = new Set(["loops", "never-practised"]);
    expect(blockedInterleavingTopics(topics, pool)).toEqual(["never-practised"]);
  });

  it("blocks everything against an empty pool — a novice cannot bootstrap a mixed session", () => {
    const empty = computeInterleavingPool([]);
    expect(blockedInterleavingTopics(["a", "b"], empty)).toEqual(["a", "b"]);
  });
});
