import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
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

const propsSchema = z.object({
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

export const widgetMetadata: WidgetMetadata = {
  description:
    "Student gamification profile: XP, level progress, coins, streaks, leaderboard rank, and earned achievements",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your progress...",
    invoked: "Profile ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function tierClass(tier: string | null): string {
  switch ((tier ?? "").toLowerCase()) {
    case "gold":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "silver":
      return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    case "bronze":
      return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300";
    case "platinum":
    case "diamond":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300";
    default:
      return "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GamificationProfile() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading your progress…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  if (!props.has_profile) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="mx-auto max-w-[680px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-[32px]">⚡</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                No XP yet
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                Complete a lesson to start earning XP and unlocking achievements.
              </p>
            </div>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const levelSpan =
    props.next_level && props.xp_needed !== null
      ? props.xp_into_level + props.xp_needed
      : null;
  const levelPct =
    levelSpan && levelSpan > 0
      ? Math.min(Math.round((props.xp_into_level / levelSpan) * 100), 100)
      : 100;

  const stats: Array<{ label: string; value: string; icon: string }> = [
    { icon: "🪙", label: "Coins", value: String(props.coins) },
    { icon: "🔥", label: "Streak", value: `${props.current_streak}d` },
    { icon: "🏆", label: "Best streak", value: `${props.longest_streak}d` },
    {
      icon: "📊",
      label: "Rank",
      value: props.rank !== null ? `#${props.rank} of ${props.participants}` : "—",
    },
  ];

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[680px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Level hero */}
          <div className="mb-3.5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3.5 flex items-center gap-3.5">
              <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] bg-violet-50 text-[26px] dark:bg-violet-950">
                {props.level_icon ?? "⭐"}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Level {props.level}
                  {props.level_title ? ` · ${props.level_title}` : ""}
                </div>
                <div className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {props.total_xp.toLocaleString()} XP total
                </div>
              </div>
            </div>

            {/* XP progress to next level */}
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-violet-600 transition-[width] duration-400 ease-out dark:bg-violet-400"
                style={{ width: `${levelPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
              {props.next_level && props.xp_needed !== null ? (
                <>
                  <span>
                    {props.xp_needed.toLocaleString()} XP to level{" "}
                    {props.next_level.level}
                  </span>
                  <span className="tabular-nums">{levelPct}%</span>
                </>
              ) : (
                <span>Max level reached 🎉</span>
              )}
            </div>
          </div>

          {/* Stat tiles */}
          <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="text-lg">{s.icon}</div>
                <div className="mt-1 text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {s.value}
                </div>
                <div className="mt-px text-[11.5px] text-zinc-400 dark:text-zinc-500">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Achievements */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                Achievements ({props.achievements.length})
              </span>
            </div>

            {props.achievements.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                No achievements earned yet — keep learning!
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5 p-3.5">
                {props.achievements.map((a) => (
                  <div
                    key={a.slug + a.earned_at}
                    className="rounded-[10px] border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-xl">{a.icon ?? "🏅"}</span>
                      <span className="text-[13px] leading-tight font-semibold text-zinc-900 dark:text-zinc-100">
                        {a.title}
                      </span>
                    </div>
                    {a.description && (
                      <div className="mb-2 text-[11.5px] leading-[1.45] text-zinc-400 dark:text-zinc-500">
                        {a.description}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-1.5">
                      {a.tier ? (
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10.5px] font-bold capitalize ${tierClass(a.tier)}`}
                        >
                          {a.tier}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        {formatDate(a.earned_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
