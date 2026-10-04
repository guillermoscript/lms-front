import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const achievementSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  tier: z.string().nullable(),
  icon: z.string().nullable(),
  xp_reward: z.number().nullable(),
  earned_at: z.string(),
});

export const propsSchema = z.object({
  has_profile: z.boolean(),
  total_xp: z.number(),
  level: z.number(),
  level_title: z.string().nullable(),
  level_icon: z.string().nullable(),
  next_level: z.object({ level: z.number(), min_xp: z.number() }).nullable(),
  xp_into_level: z.number(),
  xp_needed: z.number().nullable(),
  coins: z.number(),
  current_streak: z.number(),
  longest_streak: z.number(),
  rank: z.number().nullable(),
  participants: z.number(),
  achievements: z.array(achievementSchema),
});

export type Props = z.infer<typeof propsSchema>;
