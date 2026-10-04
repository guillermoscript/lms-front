import { z } from "zod";

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  status: z.string(),
  active_enrollments: z.number(),
  published_lessons: z.number(),
  completion_rate: z.number(),
  exam_avg: z.number().nullable(),
  submission_count: z.number(),
});

export const propsSchema = z.object({
  school: z.object({
    name: z.string(),
    courses_total: z.number(),
    courses_published: z.number(),
    courses_draft: z.number(),
    courses_archived: z.number(),
    active_enrollments: z.number(),
    students: z.number(),
    published_lessons: z.number(),
    completion_rate: z.number(),
    exam_submissions: z.number(),
    avg_exam_score: z.number().nullable(),
    at_risk_students: z.number(),
  }),
  courses: z.array(courseSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Course = z.infer<typeof courseSchema>;
