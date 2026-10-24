import { z } from "zod";

export const PostSummarySchema = z.object({
  id: z.string(),
  course_id: z.number().nullable(),
  lesson_id: z.number().nullable(),
  author_id: z.string(),
  author_name: z.string().nullable(),
  post_type: z.string(),
  title: z.string().nullable(),
  excerpt: z.string(),
  is_pinned: z.boolean(),
  is_locked: z.boolean(),
  is_graded: z.boolean(),
  due_at: z.string().nullable(),
  answered: z.boolean().nullable().describe("Questions only: an answer has been accepted"),
  comment_count: z.number(),
  reaction_count: z.number(),
  created_at: z.string(),
});

export const propsSchema = z.object({
  scope: z.enum(["school", "course"]),
  course_id: z.number().nullable(),
  posts: z.array(PostSummarySchema),
  has_more: z.boolean(),
  // Pagination window + filters echoed so "load more" repeats them. Optional so
  // a payload from an older server still validates.
  total: z.number().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  lesson_id: z.number().nullable().optional(),
  post_type: z.string().nullable().optional(),
  questions: z.enum(["unanswered", "answered"]).nullable().optional(),
});

export type Props = z.infer<typeof propsSchema>;
export type PostSummary = z.infer<typeof PostSummarySchema>;
