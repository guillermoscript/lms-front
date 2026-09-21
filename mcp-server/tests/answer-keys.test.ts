import { describe, it, expect } from "vitest";
import { mergeAnswerKey } from "../src/answer-keys.js";

describe("mergeAnswerKey (#829)", () => {
  const stripped = {
    passing_score: 70,
    questions: [
      { id: "q1", type: "multiple_choice", prompt: "?", options: ["a", "b"] },
      { id: "q2", type: "true_false", prompt: "?" },
    ],
  };

  it("puts each question's answers back by id", () => {
    const merged = mergeAnswerKey(stripped, {
      questions: { q1: { correctIndex: 1, explanation: "b" }, q2: { correctAnswer: false } },
    });
    expect(merged).toEqual({
      passing_score: 70,
      questions: [
        { id: "q1", type: "multiple_choice", prompt: "?", options: ["a", "b"], correctIndex: 1, explanation: "b" },
        { id: "q2", type: "true_false", prompt: "?", correctAnswer: false },
      ],
    });
  });

  it("returns the config untouched without a key or questions", () => {
    expect(mergeAnswerKey(stripped, null)).toBe(stripped);
    expect(mergeAnswerKey(stripped, [])).toBe(stripped);
    expect(mergeAnswerKey({ evaluation_criteria: "x" }, { questions: { q1: {} } })).toEqual({
      evaluation_criteria: "x",
    });
  });
});
