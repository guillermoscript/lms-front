import { describe, it, expect } from "vitest";
import {
  EXAM_GRADING_SECRETS_EMBED,
  withExamAnswerKey,
  withExamGradingSecrets,
} from "@/lib/exams/grading-secrets";

describe("exam grading secrets (#840)", () => {
  it("embeds every key column", () => {
    expect(EXAM_GRADING_SECRETS_EMBED).toBe(
      "exam_grading_secrets(correct_answer, grading_rubric, ai_grading_criteria, expected_keywords, correct_option_ids)"
    );
  });

  const secrets = {
    correct_answer: "b",
    grading_rubric: "r",
    ai_grading_criteria: "c",
    expected_keywords: ["k"],
    correct_option_ids: [2],
  };

  it("restores the key and option flags for staff, dropping the embed", () => {
    const merged = withExamGradingSecrets({
      question_id: 1,
      question_options: [{ option_id: 1 }, { option_id: 2 }],
      exam_grading_secrets: secrets,
    });
    expect(merged).toEqual({
      question_id: 1,
      question_options: [
        { option_id: 1, is_correct: false },
        { option_id: 2, is_correct: true },
      ],
      correct_answer: "b",
      grading_rubric: "r",
      ai_grading_criteria: "c",
      expected_keywords: ["k"],
    });
  });

  it("tolerates the embed as an array or null", () => {
    expect(
      withExamGradingSecrets({ question_id: 1, options: [{ option_id: 2 }], exam_grading_secrets: [secrets] })
        .options
    ).toEqual([{ option_id: 2, is_correct: true }]);
    expect(withExamGradingSecrets({ question_id: 1, exam_grading_secrets: null })).toEqual({
      question_id: 1,
      correct_answer: null,
      grading_rubric: null,
      ai_grading_criteria: null,
      expected_keywords: null,
    });
  });

  it("gives a student only the right answer from the RPC rows", () => {
    const qs = [
      { question_id: 1, options: [{ option_id: 1 }, { option_id: 2 }] },
      { question_id: 2 },
    ];
    expect(withExamAnswerKey(qs, [{ question_id: 1, correct_answer: null, correct_option_ids: [1] }])).toEqual([
      { question_id: 1, options: [{ option_id: 1, is_correct: true }, { option_id: 2, is_correct: false }], correct_answer: null },
      { question_id: 2, correct_answer: null },
    ]);
    expect(withExamAnswerKey(qs, null)[0].options).toEqual([
      { option_id: 1, is_correct: false },
      { option_id: 2, is_correct: false },
    ]);
  });
});
