import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const lessonSchema = z.object({
  id: z.number(),
  course_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  summary: z.string().nullable(),
  content: z.string().nullable(),
  video_url: z.string().nullable(),
  embed_code: z.string().nullable(),
  sequence: z.number(),
});

export const propsSchema = z.object({
  lesson: lessonSchema,
  course_title: z.string(),
  completed: z.boolean(),
  locked: z.boolean(),
  locked_by: z.object({ id: z.number(), title: z.string() }).nullable(),
});

export type Props = z.infer<typeof propsSchema>;
