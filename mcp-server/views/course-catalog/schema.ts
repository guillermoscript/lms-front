import { z } from "zod";

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  tags: z.union([z.array(z.string()), z.string(), z.null()]),
  lesson_count: z.number(),
  enrolled: z.boolean(),
  has_access: z.boolean(),
  covered_by_plan: z.boolean(),
  // Cheapest active product covering this course. `null` = not individually
  // for sale. Optional so a payload from an older server still validates.
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export const propsSchema = z.object({
  total: z.number(),
  // Pagination window this payload represents. Optional so a payload from an
  // older server still validates — it simply renders as a single full page.
  offset: z.number().optional(),
  limit: z.number().optional(),
  has_more: z.boolean().optional(),
  /** Repeated on every page so "load more" cannot widen the query. */
  search: z.string().nullable().optional(),
  has_subscription: z.boolean(),
  courses: z.array(courseSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Course = z.infer<typeof courseSchema>;
