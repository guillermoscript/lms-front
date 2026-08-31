import { z } from "zod";

const resultSchema = z.object({
  submission_id: z.number(),
  exam_id: z.number(),
  exam_title: z.string(),
  course_title: z.string().nullable(),
  score: z.number().nullable(),
  feedback: z.string().nullable(),
  review_status: z.string().nullable(),
  submitted_at: z.string(),
});

export const propsSchema = z.object({
  total: z.number(),
  // Pagination window this payload represents. Optional so a payload from an
  // older server still validates — it simply renders as a single full page.
  offset: z.number().optional(),
  limit: z.number().optional(),
  has_more: z.boolean().optional(),
  average_score: z.number().nullable(),
  results: z.array(resultSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Result = z.infer<typeof resultSchema>;
