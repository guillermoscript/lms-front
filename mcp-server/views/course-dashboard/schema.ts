import { z } from "zod";

const courseItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  tags: z.union([z.array(z.string()), z.string(), z.null()]),
  lesson_count: z.number(),
  enrollment_count: z.number(),
  created_at: z.string(),
  // Courses that were never edited carry NULL — the SDK runtime-validates
  // structuredContent against this schema, so it must match the DB's reality.
  updated_at: z.string().nullable(),
});

export const propsSchema = z.object({
  status: z.string(),
  total: z.number(),
  // Pagination window this payload represents. Optional so a payload from an
  // older server still validates — it simply renders as a single full page.
  offset: z.number().optional(),
  limit: z.number().optional(),
  has_more: z.boolean().optional(),

  courses: z.array(courseItemSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type CourseItem = z.infer<typeof courseItemSchema>;
