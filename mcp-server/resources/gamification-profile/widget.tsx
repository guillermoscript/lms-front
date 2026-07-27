import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
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

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading your progress…",
    emptyTitle: "No XP yet",
    emptyHint: "Complete a lesson to start earning XP and unlocking achievements.",
    level: (n: string) => `Level ${n}`,
    xpTotal: (n: string) => `${n} XP total`,
    xpToLevel: (xp: string, level: string) => `${xp} XP to level ${level}`,
    maxLevel: "Max level reached 🎉",
    coins: "Coins",
    streak: "Streak",
    bestStreak: "Best streak",
    rank: "Rank",
    rankValue: (rank: string, participants: string) => `#${rank} of ${participants}`,
    days: (n: string) => `${n}d`,
    achievements: (n: string) => `Achievements (${n})`,
    noAchievements: "No achievements earned yet — keep learning!",
    tier: {
      gold: "Gold",
      silver: "Silver",
      bronze: "Bronze",
      platinum: "Platinum",
      diamond: "Diamond",
    } as Record<string, string>,
  },
  es: {
    loading: "Cargando tu progreso…",
    emptyTitle: "Todavía no tienes XP",
    emptyHint: "Completa una lección para empezar a ganar XP y desbloquear logros.",
    level: (n: string) => `Nivel ${n}`,
    xpTotal: (n: string) => `${n} XP en total`,
    xpToLevel: (xp: string, level: string) => `${xp} XP para el nivel ${level}`,
    maxLevel: "Nivel máximo alcanzado 🎉",
    coins: "Monedas",
    streak: "Racha",
    bestStreak: "Mejor racha",
    rank: "Posición",
    rankValue: (rank: string, participants: string) => `N.º ${rank} de ${participants}`,
    days: (n: string) => `${n} d`,
    achievements: (n: string) => `Logros (${n})`,
    noAchievements: "Todavía no has ganado logros — ¡sigue aprendiendo!",
    tier: {
      gold: "Oro",
      silver: "Plata",
      bronze: "Bronce",
      platinum: "Platino",
      diamond: "Diamante",
    } as Record<string, string>,
  },
};

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
      return "bg-[var(--brand-50)] text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GamificationProfile() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  if (!props.has_profile) {
    return (
      <McpUseProvider autoSize>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="mx-auto max-w-[680px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-[32px]">⚡</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.emptyTitle}
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.emptyHint}
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
    { icon: "🪙", label: t.coins, value: fmt.number(props.coins) },
    { icon: "🔥", label: t.streak, value: t.days(fmt.number(props.current_streak)) },
    { icon: "🏆", label: t.bestStreak, value: t.days(fmt.number(props.longest_streak)) },
    {
      icon: "📊",
      label: t.rank,
      value:
        props.rank !== null
          ? t.rankValue(fmt.number(props.rank), fmt.number(props.participants))
          : "—",
    },
  ];

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[680px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Level hero */}
          <div className="mb-3.5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3.5 flex items-center gap-3.5">
              <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--brand-50)] text-[26px] dark:bg-[var(--brand-950)]">
                {props.level_icon ?? "⭐"}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {t.level(fmt.number(props.level))}
                  {props.level_title ? ` · ${props.level_title}` : ""}
                </div>
                <div className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {t.xpTotal(fmt.number(props.total_xp))}
                </div>
              </div>
            </div>

            {/* XP progress to next level */}
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-[var(--brand-600)] transition-[width] duration-400 ease-out dark:bg-[var(--brand-400)]"
                style={{ width: `${levelPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
              {props.next_level && props.xp_needed !== null ? (
                <>
                  <span>
                    {t.xpToLevel(fmt.number(props.xp_needed), fmt.number(props.next_level.level))}
                  </span>
                  <span className="tabular-nums">{fmt.percent(levelPct)}</span>
                </>
              ) : (
                <span>{t.maxLevel}</span>
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
                {t.achievements(fmt.number(props.achievements.length))}
              </span>
            </div>

            {props.achievements.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.noAchievements}
              </div>
            ) : (
              /*
                Three shared rows — title, description, footer — so an
                achievement with no description ("Buena gente" in the fixture)
                collapses that row instead of leaving a gap above its badge,
                and every tier badge and date sits on the same baseline across
                the row.
              */
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] grid-rows-[auto_auto_auto] gap-2.5 p-3.5">
                {props.achievements.map((a) => (
                  <div
                    key={a.slug + a.earned_at}
                    className="row-span-3 grid grid-rows-subgrid gap-1.5 rounded-[10px] border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{a.icon ?? "🏅"}</span>
                      <span className="text-[13px] leading-tight font-semibold text-zinc-900 dark:text-zinc-100">
                        {a.title}
                      </span>
                    </div>
                    <div className="text-[11.5px] leading-[1.45] text-zinc-400 dark:text-zinc-500">
                      {a.description}
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      {a.tier ? (
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10.5px] font-bold capitalize ${tierClass(a.tier)}`}
                        >
                          {t.tier[a.tier.toLowerCase()] ?? a.tier}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        {fmt.date(a.earned_at)}
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
