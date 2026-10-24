import { z } from "zod";

const questionSchema = z.object({
  question_id: z.number(),
  question_text: z.string(),
  question_type: z.string(),
  // Only multiple_choice questions carry options. Never an answer key.
  options: z
    .array(z.object({ option_id: z.number(), option_text: z.string() }))
    .optional(),
});

/**
 * One shape for both outcomes of lms_get_exam_for_student: the exam to take,
 * or the fact that it was already submitted (no questions then).
 */
export const propsSchema = z.object({
  exam_id: z.number(),
  course_id: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  already_submitted: z.boolean(),
  submission_id: z.number().nullable(),
  questions: z.array(questionSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Question = z.infer<typeof questionSchema>;

/** lms_submit_exam's result — what the widget shows after submitting. */
export const submitResultSchema = z.object({
  exam_id: z.number(),
  submission_id: z.number(),
  answered_count: z.number(),
  question_count: z.number(),
  status: z.enum(["graded", "pending"]),
  score: z.number().nullable(),
  overall_feedback: z.string().nullable().optional(),
});

export type SubmitResult = z.infer<typeof submitResultSchema>;
