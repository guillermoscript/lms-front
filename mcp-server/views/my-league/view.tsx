import { useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { withWidgetBoundary } from "../shared/error-boundary";
import { ViewPending } from "../shared/view-pending";
import { studentDisplayName } from "../shared/student-display";
import { type Props, type Standing } from "./schema";
import "virtual:mcp-use/tailwind.css";

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading your league…",
    title: "Weekly league",
    tierOf: (tier: string, max: string) => `Tier ${tier} of ${max}`,
    week: (start: string, end: string) => `${start} – ${end}`,
    you: "You",
    yourRank: (rank: string, size: string) => `#${rank} of ${size}`,
    xp: (n: string) => `${n} XP`,
    promoteZone: "Promotion zone",
    demoteZone: "Demotion zone",
    safeZone: "Safe",
    zoneHint: (up: string, down: string) =>
      `Top ${up} move up, bottom ${down} move down when the week ends.`,
    caption: "League standings this week",
    rank: "Rank",
    student: "Student",
    weeklyXp: "Weekly XP",
    unnamed: "Student",
    noLeagueTitle: "Not in a league yet",
    noLeagueHint: "Earn XP this week — finishing lessons and exercises — to be placed in a league.",
    optedOutTitle: "Leagues are off",
    optedOutHint: "You opted out of leagues in this school.",
  },
  es: {
    loading: "Cargando tu liga…",
    title: "Liga semanal",
    tierOf: (tier: string, max: string) => `Nivel ${tier} de ${max}`,
    week: (start: string, end: string) => `${start} – ${end}`,
    you: "Tú",
    yourRank: (rank: string, size: string) => `#${rank} de ${size}`,
    xp: (n: string) => `${n} XP`,
    promoteZone: "Zona de ascenso",
    demoteZone: "Zona de descenso",
    safeZone: "A salvo",
    zoneHint: (up: string, down: string) =>
      `Los ${up} primeros suben y los ${down} últimos bajan al terminar la semana.`,
    caption: "Clasificación de la liga esta semana",
    rank: "Puesto",
    student: "Estudiante",
    weeklyXp: "XP semanal",
    unnamed: "Estudiante",
    noLeagueTitle: "Aún no estás en una liga",
    noLeagueHint: "Gana XP esta semana — terminando lecciones y ejercicios — para entrar en una liga.",
    optedOutTitle: "Ligas desactivadas",
    optedOutHint: "Desactivaste las ligas en esta escuela.",
  },
};

function zoneRowClass(s: Standing): string {
  if (s.is_me) return "bg-[var(--brand-50)] dark:bg-[var(--brand-950)]";
  if (s.zone === "promote") return "bg-green-50/60 dark:bg-green-950/30";
  if (s.zone === "demote") return "bg-red-50/60 dark:bg-red-950/30";
  return "";
}

// ── Component ────────────────────────────────────────────────────────────────

function MyLeague() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <ViewPending view={view} label={t.loading} />
        </div>
      </>
    );
  }

  const league = view.toolOutput as Props;
  const me = league.standings.find((s) => s.is_me);
  const size = league.cohort_size ?? league.standings.length;

  let body;
  if (!league.in_league) {
    const optedOut = league.reason === "opted_out";
    body = (
      <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 text-3xl" aria-hidden>
          🏆
        </div>
        <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
          {optedOut ? t.optedOutTitle : t.noLeagueTitle}
        </p>
        <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
          {optedOut ? t.optedOutHint : t.noLeagueHint}
        </p>
      </div>
    );
  } else {
    body = (
      <>
        {me && (
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="rounded-xl bg-[var(--brand-600)] px-3 py-2 text-xl font-bold text-white tabular-nums">
              #{fmt.number(me.rank)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t.yourRank(fmt.number(me.rank), fmt.number(size))} · {t.xp(fmt.number(me.weekly_xp))}
              </p>
              <p
                className={`mt-0.5 mb-0 text-xs font-semibold ${
                  me.zone === "promote"
                    ? "text-green-600 dark:text-green-400"
                    : me.zone === "demote"
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {me.zone === "promote" ? t.promoteZone : me.zone === "demote" ? t.demoteZone : t.safeZone}
              </p>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <colgroup>
              <col className="w-16" />
              <col />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                <th scope="col" className="px-4 py-2 font-semibold">{t.rank}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{t.student}</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">{t.weeklyXp}</th>
              </tr>
            </thead>
            <tbody>
              {league.standings.map((s) => (
                <tr
                  key={s.user_id}
                  aria-current={s.is_me ? "true" : undefined}
                  className={`border-b border-zinc-100 last:border-b-0 dark:border-zinc-800 ${zoneRowClass(s)}`}
                >
                  <td className="px-4 py-2.5 font-bold text-zinc-500 tabular-nums dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      {fmt.number(s.rank)}
                      {s.zone === "promote" && (
                        <span className="text-green-600 dark:text-green-400" aria-label={t.promoteZone}>▲</span>
                      )}
                      {s.zone === "demote" && (
                        <span className="text-red-600 dark:text-red-400" aria-label={t.demoteZone}>▼</span>
                      )}
                    </span>
                  </td>
                  <td className="truncate px-2 py-2.5 text-zinc-900 dark:text-zinc-100">
                    {s.is_me ? (
                      <span className="font-semibold">
                        {t.you}
                        {s.full_name ? ` · ${s.full_name}` : ""}
                      </span>
                    ) : (
                      studentDisplayName(s.full_name, t.unnamed)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-zinc-700 tabular-nums dark:text-zinc-300">
                    {fmt.number(s.weekly_xp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {league.promote_count !== null && league.demote_count !== null && (
          <p className="mt-3 mb-0 text-xs text-zinc-400 dark:text-zinc-500">
            {t.zoneHint(fmt.number(league.promote_count), fmt.number(league.demote_count))}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[640px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="m-0 text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {league.tier?.name ?? t.title}
            </h1>
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {league.tier ? t.tierOf(fmt.number(league.tier.tier), fmt.number(league.tier.max_tier)) : ""}
              {league.week_start && league.week_end
                ? `${league.tier ? " · " : ""}${t.week(fmt.date(league.week_start), fmt.date(league.week_end))}`
                : ""}
            </span>
          </div>
          {body}
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(MyLeague);
