import { describe, it, expect } from "vitest";
import {
  UNNAMED_STUDENT,
  isNamedStudent,
  studentDisplayName,
  studentInitials,
} from "../resources/shared/student-display.js";
import { aggregateExamSubmissions } from "../src/tools/analytics.js";

/**
 * Issue #568 — missing data must not be rendered as if it were real data.
 *
 * The two contracts these tests hold in place:
 *   1. Nothing derived from a user id may ever stand in for a name.
 *   2. "has not sat an exam" and "sat one, waiting on a grade" are different
 *      states and must stay distinguishable in the roster's numbers.
 */

describe("studentDisplayName", () => {
  it("returns the trimmed name when the profile has one", () => {
    expect(studentDisplayName("  Grace Okoye  ")).toBe("Grace Okoye");
  });

  it("never leaks a user id — null, empty and blank all read as unnamed", () => {
    for (const absent of [null, undefined, "", "   ", "\t\n"]) {
      expect(studentDisplayName(absent)).toBe(UNNAMED_STUDENT);
      expect(isNamedStudent(absent)).toBe(false);
    }
  });

  it("uses the caller's translated placeholder when given one", () => {
    // Widgets pass their own `t.unnamedStudent` (see resources/shared/i18n.tsx),
    // so the placeholder follows the reader's language.
    expect(studentDisplayName(null, "Estudiante sin nombre")).toBe("Estudiante sin nombre");
    // A real name is database content and is never translated or replaced.
    expect(studentDisplayName("Grace Okoye", "Estudiante sin nombre")).toBe("Grace Okoye");
  });
});

describe("studentInitials", () => {
  it("uses the first two words of a real name", () => {
    expect(studentInitials("Grace Okoye")).toBe("GO");
    expect(studentInitials("Prince")).toBe("P");
  });

  it("degrades to a neutral glyph rather than letters from an id", () => {
    // The bug: `id.slice(0, 2).toUpperCase()` rendered "U-" for user `u-008`,
    // which reads as somebody's initials while belonging to nobody.
    expect(studentInitials(null)).toBe("·");
    expect(studentInitials("   ")).toBe("·");
  });
});

describe("aggregateExamSubmissions", () => {
  it("counts an ungraded submission but leaves the average null", () => {
    const agg = aggregateExamSubmissions([
      { student_id: "u-007", score: null, submission_date: "2026-07-26T08:12:00Z" },
    ]);
    // Before the fix this was submitted: 0 — the submission vanished entirely
    // and the student read as "0 exams" instead of "1 exam, ungraded".
    expect(agg.get("u-007")).toEqual({
      submitted: 1,
      avg: null,
      last: "2026-07-26T08:12:00Z",
    });
  });

  it("averages only the graded submissions while counting all of them", () => {
    const agg = aggregateExamSubmissions([
      { student_id: "u-001", score: 90, submission_date: "2026-07-01T00:00:00Z" },
      { student_id: "u-001", score: 80, submission_date: "2026-07-02T00:00:00Z" },
      { student_id: "u-001", score: null, submission_date: "2026-07-03T00:00:00Z" },
    ]);
    expect(agg.get("u-001")).toEqual({
      submitted: 3,
      avg: 85, // (90 + 80) / 2 — the ungraded one is not a zero
      last: "2026-07-03T00:00:00Z",
    });
  });

  it("keeps students apart and reports the latest submission date", () => {
    const agg = aggregateExamSubmissions([
      { student_id: "a", score: 50, submission_date: "2026-07-05T00:00:00Z" },
      { student_id: "b", score: 100, submission_date: "2026-07-09T00:00:00Z" },
      { student_id: "a", score: 70, submission_date: "2026-07-01T00:00:00Z" },
    ]);
    expect(agg.get("a")).toEqual({ submitted: 2, avg: 60, last: "2026-07-05T00:00:00Z" });
    expect(agg.get("b")).toEqual({ submitted: 1, avg: 100, last: "2026-07-09T00:00:00Z" });
  });

  it("has no entry for a student who never submitted", () => {
    expect(aggregateExamSubmissions([]).get("nobody")).toBeUndefined();
  });

  it("tolerates a submission with no date", () => {
    const agg = aggregateExamSubmissions([
      { student_id: "a", score: null, submission_date: null },
    ]);
    expect(agg.get("a")).toEqual({ submitted: 1, avg: null, last: null });
  });
});
