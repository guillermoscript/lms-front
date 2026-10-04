import { z } from "zod";

// Props produced by lms_get_exam_readiness (Epic #348 Phase 3, #358).
export const propsSchema = z.object({
  course_id: z.number().describe("The course being assessed"),
  course_title: z.string().describe("Course title"),
  exam: z
    .object({
      exam_id: z.number(),
      title: z.string(),
      exam_date: z.string().nullable(),
    })
    .nullable()
    .describe("The targeted or next upcoming exam, if any"),
  readiness: z
    .number()
    .nullable()
    .describe("Overall readiness 0-100, null when there is no signal yet"),
  components: z.object({
    exam_history: z.number().nullable(),
    practice: z.number().nullable(),
    lesson_coverage: z.number().nullable(),
    weights: z.object({
      exam_history: z.number(),
      practice: z.number(),
      lesson_coverage: z.number(),
    }),
  }),
  formula: z.string().describe("Human-readable readiness formula"),
  topics: z.array(
    z.object({
      label: z.string(),
      mastery: z.number(),
      source: z.enum(["exam", "practice"]),
      evidence: z.string(),
    })
  ),
  lessons: z.object({ completed: z.number(), total: z.number() }),
});

export type Props = z.infer<typeof propsSchema>;
