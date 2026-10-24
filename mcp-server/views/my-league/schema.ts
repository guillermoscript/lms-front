import { z } from "zod";

const standingSchema = z.object({
  rank: z.number(),
  user_id: z.string(),
  full_name: z.string().nullable(),
  weekly_xp: z.number(),
  is_me: z.boolean(),
  zone: z.enum(["promote", "demote"]).nullable(),
});

export const propsSchema = z.object({
  in_league: z.boolean(),
  reason: z.string().nullable().describe("no_league or opted_out when not in a league"),
  week_start: z.string().nullable(),
  week_end: z.string().nullable(),
  tier: z
    .object({ tier: z.number(), slug: z.string(), name: z.string(), max_tier: z.number() })
    .nullable(),
  promote_count: z.number().nullable(),
  demote_count: z.number().nullable(),
  cohort_size: z.number().nullable(),
  standings: z.array(standingSchema),
});

export type Props = z.infer<typeof propsSchema>;
export type Standing = z.infer<typeof standingSchema>;
