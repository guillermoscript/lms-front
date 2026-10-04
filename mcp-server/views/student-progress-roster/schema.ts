import { z } from "zod";

const studentSchema = z.object({
  student_id: z.string(),
  student_name: z.string().nullable(),
  status: z.string(),
  enrolled: z.string(),
  completed_lessons: z.number(),
  progress_pct: z.number().nullable(),
  exam_avg: z.number().nullable(),
  exam_count: z.number(),
  last_active: z.string().nullable(),
  at_risk: z.boolean(),
});

export const propsSchema = z.object({
  course: z.object({
    id: z.number(),
    title: z.string(),
    published_lessons: z.number(),
  }),
  students: z.array(studentSchema),
  // Pagination window this payload represents. Optional so a payload from an
  // older server still validates — it simply renders as a single full page.
  offset: z.number().optional(),
  limit: z.number().optional(),
  has_more: z.boolean().optional(),
  /** Repeated on every page so "load more" keeps the same filter. */
  status: z.string().nullable().optional(),
  summary: z.object({
    total: z.number(),
    at_risk: z.number(),
    avg_progress: z.number(),
  }),
});

export type Props = z.infer<typeof propsSchema>;
export type Student = z.infer<typeof studentSchema>;
