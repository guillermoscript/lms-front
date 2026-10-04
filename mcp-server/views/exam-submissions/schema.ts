import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const submissionSchema = z.object({
  id: z.number(),
  // `lms_list_exam_submissions` sends `null` when the profile has no full name.
  student_name: z.string().nullable(),
  score: z.number().nullable(),
  submission_date: z.string(),
  review_status: z.string().nullable(),
});

export const propsSchema = z.object({
  exam_id: z.number(),
  total: z.number(),
  // Pagination window this payload represents. Optional so a payload from an
  // older server still validates — it simply renders as a single full page.
  offset: z.number().optional(),
  limit: z.number().optional(),
  has_more: z.boolean().optional(),

  submissions: z.array(submissionSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Submission = z.infer<typeof submissionSchema>;
