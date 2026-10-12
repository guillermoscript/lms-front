import { describe, it, expect, vi } from "vitest";
import { gradeExamWithPlatform, normalizeExamAnswers } from "./exam-taking.js";
import { isToolAllowedForRole } from "../tool-policy.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe("exam-taking policy", () => {
  it.each(["lms_get_exam_for_student", "lms_submit_exam"])("%s is open to every role", (n) => {
    for (const r of ["student", "teacher", "admin"]) expect(isToolAllowedForRole(r, n)).toBe(true);
    expect(isToolAllowedForRole(undefined, n)).toBe(false);
  });
});

describe("normalizeExamAnswers", () => {
  it("keys by stringified id and reports unknown questions", () => {
    const r = normalizeExamAnswers(
      [
        { question_id: 1, answer: "12" },
        { question_id: 9, answer: "x" },
      ],
      new Set([1, 2])
    );
    expect(r.payload).toEqual({ "1": "12" });
    expect(r.unknownIds).toEqual([9]);
  });
});

describe("gradeExamWithPlatform", () => {
  it("posts only the submission id with the bearer token", async () => {
    const f = vi.fn(async () => json(200, { score: 80, overall_feedback: "ok", question_feedback: [] }));
    const r = await gradeExamWithPlatform("https://a.test", "tok", 5, 7, f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, score: 80, overall_feedback: "ok", pending_teacher_review: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://a.test/api/exams/5/grade");
    expect(init.body).toBe(JSON.stringify({ submissionId: 7 }));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("flags parked-for-teacher submissions", async () => {
    const f = async () => json(200, { score: null, overall_feedback: "pending_teacher_review" });
    const r = await gradeExamWithPlatform("https://a.test", "t", 1, 1, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, pending_teacher_review: true });
  });

  it("maps typed AI errors to pending with the code only", async () => {
    const f = async () => json(402, { error: { code: "ai_not_configured", settingsUrl: "x" } });
    const r = await gradeExamWithPlatform("https://a.test", "t", 1, 1, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, pending: true });
    expect((r as { reason: string }).reason).toContain("ai_not_configured");
  });

  it("network failure stays pending", async () => {
    const f = async () => {
      throw new Error("boom");
    };
    const r = await gradeExamWithPlatform("https://a.test", "t", 1, 1, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, pending: true });
  });
});
