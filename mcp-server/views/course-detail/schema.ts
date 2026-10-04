import { z } from "zod";

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  tags: z.union([z.array(z.string()), z.string(), z.null()]),
  require_sequential_completion: z.boolean(),
  enrollment_count: z.number(),
  created_at: z.string(),
});

const lessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  sequence: z.number(),
  status: z.string(),
});

const examSchema = z.object({
  id: z.number(),
  title: z.string(),
  date: z.string().nullable(),
  duration: z.number(),
  status: z.string(),
});

export const propsSchema = z.object({
  course: courseSchema,
  lessons: z.array(lessonSchema),
  exams: z.array(examSchema),
});

export type Props = z.infer<typeof propsSchema>;
