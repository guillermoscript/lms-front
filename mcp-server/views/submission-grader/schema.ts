import { z } from "zod";

const optionSchema = z.object({
  text: z.string(),
  is_correct: z.boolean(),
});

const questionSchema = z.object({
  question_id: z.number(),
  text: z.string(),
  type: z.string(),
  options: z.array(optionSchema),
  student_answer: z.string().nullable(),
  points_earned: z.number().nullable(),
  points_possible: z.number().nullable(),
  is_correct: z.boolean().nullable(),
  ai_feedback: z.string().nullable(),
  ai_confidence: z.number().nullable(),
  is_overridden: z.boolean(),
});

export const propsSchema = z.object({
  submission: z.object({
    id: z.number(),
    exam_id: z.number(),
    exam_title: z.string(),
    student_id: z.string(),
    student_name: z.string().nullable(),
    score: z.number().nullable(),
    feedback: z.string(),
    review_status: z.string(),
    date: z.string(),
  }),
  questions: z.array(questionSchema),
  summary: z.object({
    question_count: z.number(),
    graded_count: z.number(),
    total_points_earned: z.number(),
    total_points_possible: z.number(),
  }),
});

export type Props = z.infer<typeof propsSchema>;
