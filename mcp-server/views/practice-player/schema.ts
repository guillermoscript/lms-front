import { z } from "zod";

const questionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "multiple_choice",
    "true_false",
    "fill_blank",
    "match",
    "order",
    "free_text",
  ]),
  prompt: z.string(),
  // Mixed (interleaved) sessions: which topic this question drills (#393).
  topic: z.string().optional(),
  // Explanatory feedback shown after grading (#391); optional for older payloads.
  explanation: z.string().optional(),
  options: z.array(z.string()).optional(),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).optional(),
  sequence: z.array(z.string()).optional(),
  correct: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
});

export const propsSchema = z.object({
  topic: z.string(),
  // mixed = interleaved session across mastery-gated topics (#393); shows the
  // expectation-setting banner and per-question topic in the header pill.
  mode: z.enum(["focused", "mixed"]).optional(),
  course_id: z.number().nullable(),
  lesson_id: z.number().nullable(),
  source_exercise_id: z.number().nullable(),
  questions: z.array(questionSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Question = z.infer<typeof questionSchema>;
