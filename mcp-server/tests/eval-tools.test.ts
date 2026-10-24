import { describe, expect, it } from "vitest";

const { isToolAllowedForRole } = await import("../src/tool-policy.js");
const evals = await import("../src/tools/evals.js");

const TOOLS = [
  "lms_list_eval_cases",
  "lms_create_eval_case",
  "lms_update_eval_case",
  "lms_generate_eval_scenarios",
  "lms_run_evals",
  "lms_get_eval_run",
  "lms_list_eval_runs",
  "lms_get_task_version_metrics",
];

describe("eval tool policy", () => {
  it("admins get all, teachers all but delete, students none", () => {
    for (const n of [...TOOLS, "lms_delete_eval_case"]) {
      expect(isToolAllowedForRole("admin", n)).toBe(true);
      expect(isToolAllowedForRole("student", n)).toBe(false);
    }
    for (const n of TOOLS) expect(isToolAllowedForRole("teacher", n)).toBe(true);
    expect(isToolAllowedForRole("teacher", "lms_delete_eval_case")).toBe(false);
  });

  it("registers every tool", () => {
    const names: string[] = [];
    evals.registerEvalTools({ tool: (d: { name: string }) => { names.push(d.name); return d; } } as never);
    expect(names.sort()).toEqual([...TOOLS, "lms_delete_eval_case"].sort());
  });
});

describe("buildCreateCaseBody", () => {
  it("requires messages for a golden and persona for a scenario", () => {
    expect(evals.buildCreateCaseBody({ kind: "golden_chat", name: "a" }).ok).toBe(false);
    expect(evals.buildCreateCaseBody({ kind: "scenario", name: "a" }).ok).toBe(false);
    expect(evals.buildCreateCaseBody({ kind: "golden_chat", name: "a", messages: [{ role: "user", text: "hi" }], persona: "x" }).ok).toBe(false);
    expect(evals.buildCreateCaseBody({ kind: "scenario", name: "a", persona: "x", completed: true }).ok).toBe(false);
  });
  it("builds the app contract", () => {
    const g = evals.buildCreateCaseBody({ kind: "golden_chat", name: "g", expected_completed: true, messages: [{ role: "user", text: "hi" }], completed: true, completed_turn: 2 });
    expect(g).toMatchObject({ ok: true, body: { kind: "golden_chat", source: "teacher", expected: { completed: true }, must_keep: [], golden_output: { completed: true, completed_turn: 2 } } });
    const s = evals.buildCreateCaseBody({ kind: "scenario", name: "s", persona: "p" });
    expect(s).toMatchObject({ ok: true, body: { kind: "scenario", expected: { completed: null }, input: { persona: "p", goal: "", script: [], max_turns: 8 } } });
  });
});

describe("describeEvalError / formatRunReport", () => {
  it("maps known codes", () => {
    expect(evals.describeEvalError(409, { error: "no_cases" })).toMatch(/golden/);
    expect(evals.describeEvalError(409, { error: "run_in_progress" })).toMatch(/already in progress/);
    expect(evals.describeEvalError(429, { error: "run_limit", limit: 40 })).toMatch(/40/);
    expect(evals.describeEvalError(409, { error: "case_limit", limit: 20 })).toMatch(/20/);
    expect(evals.describeEvalError(400, { error: { code: "no_api_key" } })).toMatch(/AI provider key/);
  });
  it("reports failures and gates transcripts", () => {
    const results = [
      { case_name: "A", case_kind: "scenario", completed: true, completed_turn: 3, deviation: null, passed: true, error: null, verdicts: [], transcript: [{ role: "user", text: "hello" }] },
      { case_name: "B", case_kind: "golden_chat", completed: false, completed_turn: null, deviation: "expected completion", passed: false, error: null, verdicts: [{ criterion: "no answer leak", passed: false, evidence: "tutor said 42" }], transcript: [{ role: "assistant", text: "42" }] },
    ];
    const run = { status: "completed", summary: { passed: 1, total: 2 }, ai_config_versions: { version_no: 4 } };
    const short = evals.formatRunReport("r1", run, results, false);
    expect(short).toContain("v4");
    expect(short).toContain("✓ **A**");
    expect(short).toContain("✗ **B**");
    expect(short).toContain("tutor said 42");
    expect(short).not.toContain("## Transcripts");
    expect(evals.formatRunReport("r1", run, results, true)).toContain("## Transcripts");
  });
});
