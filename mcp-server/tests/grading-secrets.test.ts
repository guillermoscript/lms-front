import { describe, it, expect } from "vitest";
import { mergeGradingSecrets, withGradingSecrets } from "../src/grading-secrets.js";

describe("mergeGradingSecrets (#829, #833)", () => {
  const stripped = {
    passing_score: 70,
    questions: [
      { id: "q1", type: "multiple_choice", prompt: "?", options: ["a", "b"] },
      { id: "q2", type: "true_false", prompt: "?" },
    ],
  };

  it("puts each question's answers back by id", () => {
    const merged = mergeGradingSecrets(stripped, {
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
    expect(mergeGradingSecrets(stripped, null)).toBe(stripped);
    expect(mergeGradingSecrets(stripped, [])).toBe(stripped);
    expect(mergeGradingSecrets({ evaluation_criteria: "x" }, { questions: { q1: {} } })).toEqual({
      evaluation_criteria: "x",
    });
  });
});

describe("withGradingSecrets (#833)", () => {
  it("restores the prompt, template variables and secret config keys", () => {
    const merged = withGradingSecrets({
      id: 1,
      system_prompt: null,
      template_variables: null,
      exercise_config: { passing_score: 70 },
      exercise_grading_secrets: {
        questions: {},
        config: { evaluation_criteria: "shows the formula" },
        system_prompt: "grade strictly",
        template_variables: { topic: "algebra" },
      },
    });
    expect(merged).toEqual({
      id: 1,
      system_prompt: "grade strictly",
      template_variables: { topic: "algebra" },
      exercise_config: { passing_score: 70, evaluation_criteria: "shows the formula" },
    });
  });
});
