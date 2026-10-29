import { describe, expect, it } from "vitest";
import { formatRunReport } from "./evals.js";

const lessonResult = (over: Record<string, unknown> = {}) => ({
  case_name: "Confused student",
  case_kind: "scenario",
  completed: true,
  completed_turn: 3,
  expected: { completed: true },
  deviation: 20,
  passed: false,
  error: null,
  verdicts: [
    { criterion: "Corrects with a question", passed: true, evidence: "ok" },
    { criterion: "Does not give the answer", passed: false, evidence: "\"It's 'una sopa'\"" },
  ],
  output: { repeats: 3, completed_flags: [true, false, true], criteria_passes: [3, 1], errored_repeats: 0, unstable: true },
  ...over,
});

describe("formatRunReport (lesson repeats)", () => {
  it("shows the repeat votes, the instability and the summary counts", () => {
    const report = formatRunReport(
      "run-1",
      { status: "done", summary: { total: 1, passed: 0, failed: 1, repeats: 3, unstable_cases: 1 } },
      [lessonResult()] as never,
      false
    );
    expect(report).toContain("repeats: 3, unstable cases: 1");
    expect(report).toContain("completed at turn 3 (expected: should complete) — completed in 2/3 repeats, UNSTABLE (repeats disagreed)");
    expect(report).toContain("- ✗ Does not give the answer (passed in 1/3 repeats)");
  });

  it("keeps single-pass lines unchanged", () => {
    const report = formatRunReport(
      "run-2",
      { status: "done", summary: { total: 1 } },
      [lessonResult({ output: null })] as never,
      false
    );
    expect(report).not.toContain("repeats");
    expect(report).toContain("- ✗ Does not give the answer — evidence:");
  });
});
