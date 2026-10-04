import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const lessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  video_url: z.string().nullable(),
  embed_code: z.string().nullable(),
  content: z.string().nullable(),
  status: z.string(),
  sequence: z.number(),
});

const resourceSchema = z.object({
  id: z.number(),
  file_name: z.string(),
  file_size: z.number().nullable(),
  mime_type: z.string().nullable(),
});

export const propsSchema = z.object({
  lesson: lessonSchema,
  resources: z.array(resourceSchema),
});

export type Props = z.infer<typeof propsSchema>;
