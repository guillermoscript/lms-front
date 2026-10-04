import { z } from "zod";

const hotspotSchema = z.object({
  scope: z.enum(["practice", "exercise", "exam_question"]),
  ref: z.union([z.number(), z.string()]).nullable(),
  label: z.string(),
  students_affected: z.number(),
  severity: z.number(),
  evidence: z.string(),
});

const hardestItemSchema = z.object({
  item_type: z.enum(["exercise", "exam_question"]),
  item_id: z.number(),
  title: z.string(),
  rating: z.number(),
  attempt_count: z.number(),
  /** The teacher's own label. Always null for exam questions, which have none. */
  difficulty_level: z.enum(["easy", "medium", "hard"]).nullable(),
  /** Set only when the measured rating contradicts `difficulty_level`. */
  mismatch: z.enum(["harder_than_labeled", "easier_than_labeled"]).nullable(),
});

export const propsSchema = z.object({
  course: z.object({ id: z.number(), title: z.string() }),
  window_days: z.number(),
  hotspots: z.array(hotspotSchema),
  hardest_items: z.array(hardestItemSchema),
  truncated: z.boolean(),
  sources: z.object({
    practice_attempts: z.number(),
    exercise_evaluations: z.number(),
    exam_submissions: z.number(),
  }),
  /**
   * Kept in the payload for the model's benefit even though nothing here
   * renders it — it explains how `severity` was derived, which the model needs
   * to reason about the ranking it is shown.
   */
  severity_formula: z.string(),
});

export type Props = z.infer<typeof propsSchema>;
export type Hotspot = z.infer<typeof hotspotSchema>;
export type HardestItem = z.infer<typeof hardestItemSchema>;
