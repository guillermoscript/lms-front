import { z } from "zod";

// Props produced by lms_get_study_plan (Epic #348 Phase 4, #359).
export const propsSchema = z.object({
  week_start: z.string().describe("Monday of the plan's week, YYYY-MM-DD"),
  goals: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      kind: z.enum(["lesson", "practice", "review", "exam_prep", "custom"]),
      course_id: z.number().nullable(),
      // Required goals gate week completion; optional for payloads predating #391.
      required: z.boolean().optional(),
      done: z.boolean(),
      done_at: z.string().nullable(),
    })
  ),
  progress: z.number().describe("Percent of goals done, 0-100"),
  context: z.object({
    next_lessons: z.array(
      z.object({
        course_id: z.number(),
        course_title: z.string(),
        lesson_id: z.number(),
        lesson_title: z.string(),
      })
    ),
    due_reviews: z.number(),
  }),
});

export type Props = z.infer<typeof propsSchema>;
export type Goal = Props["goals"][number];
