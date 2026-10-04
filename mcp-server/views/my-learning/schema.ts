import { z } from "zod";

/**
 * Props contract for the my-learning view.
 *
 * Shared between the view (types its `toolOutput`) and the tool registration
 * (`outputSchema` on lms_my_learning), so the payload a tool emits and the
 * shape the view renders can never drift apart.
 */
const nextLessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  sequence: z.number(),
});

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  enrolled_at: z.string(),
  lessons_total: z.number(),
  lessons_completed: z.number(),
  progress: z.number(),
  next_lesson: nextLessonSchema.nullable(),
});

export const propsSchema = z.object({
  total: z.number(),
  average_progress: z.number(),
  courses: z.array(courseSchema),
});

export type Props = z.infer<typeof propsSchema>;
