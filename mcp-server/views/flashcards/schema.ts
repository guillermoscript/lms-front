import { z } from "zod";

// Props produced by lms_get_due_reviews (Epic #348 Phase 4, #355).
export const propsSchema = z.object({
  cards: z
    .array(
      z.object({
        id: z.number(),
        front: z.string(),
        back: z.string(),
        repetitions: z.number(),
        interval_days: z.number(),
      })
    )
    .describe("Due cards for this session, oldest due first"),
  total_due: z.number().describe("Total cards due (may exceed the session batch)"),
});

export type Props = z.infer<typeof propsSchema>;
