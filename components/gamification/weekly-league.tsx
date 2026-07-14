"use client";

import { useEffect, useState } from "react";
import { useGamificationSummary } from "@/lib/hooks/use-gamification-summary";
import { useLeague } from "@/lib/hooks/use-league";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
    IconShield,
    IconLock,
    IconClock,
    IconArrowUp,
    IconArrowDown,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const TIER_ACCENTS: Record<string, string> = {
    bronze: "text-amber-600",
    silver: "text-slate-400",
    gold: "text-yellow-500",
    sapphire: "text-blue-500",
    ruby: "text-rose-500",
};

function useCountdown(target: string | undefined) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!target) return;
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [target]);

    if (!target) return null;

    const diff = new Date(target).getTime() - now;
    if (Number.isNaN(diff) || diff <= 0) return null;

    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export function WeeklyLeague() {
    const { summary } = useGamificationSummary();
    const { data, isLoading, error } = useLeague();
    const t = useTranslations("components.gamification");
    const timeLeft = useCountdown(data?.in_league ? data.week_end : undefined);

    // Feature locked — same upgrade-card pattern as MiniLeaderboard
    if (summary && !summary.features?.leaderboard) {
        return (
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-muted/50">
                            <IconShield size={18} className="text-muted-foreground" />
                        </div>
                        <h3 className="font-bold text-sm tracking-tight">{t("league.title")}</h3>
                    </div>
                    <IconLock size={16} className="text-muted-foreground" />
                </div>
                <div className="p-6 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
                        <IconShield size={24} className="text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-bold">{t("upgrade.leagueLocked")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("upgrade.upgradeDescription")}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading && !data) {
        return (
            <div className="space-y-4 p-4">
                <Skeleton className="h-6 w-32" />
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <Skeleton className="h-4 flex-1" />
                            <Skeleton className="h-4 w-12" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Fail quietly — the sidebar shouldn't surface a broken widget
    if (error || !data) return null;

    if (!data.in_league) {
        if (data.reason === "opted_out") {
            return (
                <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-muted/50">
                            <IconShield size={18} className="text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground">{t("league.optedOutNote")}</p>
                    </div>
                </div>
            );
        }

        // reason === 'no_league' — quiet empty state
        return (
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-muted/50">
                        <IconShield size={18} className="text-muted-foreground" />
                    </div>
                    <h3 className="font-bold text-sm tracking-tight">{t("league.title")}</h3>
                </div>
                <div className="p-6 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
                        <IconShield size={24} className="text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-bold">{t("league.emptyTitle")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("league.emptyDescription")}</p>
                    </div>
                </div>
            </div>
        );
    }

    const tier = data.tier;
    const accent = (tier && TIER_ACCENTS[tier.slug]) || "text-muted-foreground";
    const standings = data.standings ?? [];
    const promoteCount = data.promote_count ?? 0;
    const demoteCount = data.demote_count ?? 0;
    const cohortSize = data.cohort_size ?? standings.length;
    const showDemote = cohortSize > promoteCount + demoteCount;

    return (
        <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-muted/50">
                        <IconShield size={18} className={accent} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-sm tracking-tight truncate">{t("league.title")}</h3>
                        {tier && (
                            <p className="text-[10px] font-medium text-muted-foreground truncate">
                                {tier.name}
                            </p>
                        )}
                    </div>
                </div>
                {timeLeft && (
                    <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                        <IconClock size={14} />
                        <span className="text-[10px] font-medium whitespace-nowrap">
                            {t("league.endsIn", { time: timeLeft })}
                        </span>
                    </div>
                )}
            </div>

            <div className="p-2 space-y-1">
                {standings.length > 0 ? (
                    standings.map((row) => {
                        const inPromoteZone = row.rank <= promoteCount;
                        const inDemoteZone = showDemote && row.rank > cohortSize - demoteCount;

                        return (
                            <div
                                key={row.user_id}
                                className={cn(
                                    "flex items-center gap-3 p-2 rounded-xl",
                                    row.is_me && "bg-accent ring-1 ring-primary/20"
                                )}
                            >
                                <div className="flex items-center justify-center w-6 text-xs font-bold text-muted-foreground">
                                    {row.rank}
                                </div>

                                <Avatar className="h-8 w-8 border border-border/50">
                                    <AvatarImage src={row.avatar_url || ""} />
                                    <AvatarFallback className="text-[10px] font-bold">
                                        {row.full_name?.[0]?.toUpperCase() || "U"}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">
                                        {row.full_name || t("league.anonymous")}
                                    </p>
                                </div>

                                {inPromoteZone && (
                                    <IconArrowUp
                                        size={14}
                                        className="text-emerald-500 shrink-0"
                                        aria-label={t("league.promoteZone")}
                                    />
                                )}
                                {inDemoteZone && (
                                    <IconArrowDown
                                        size={14}
                                        className="text-red-500 shrink-0"
                                        aria-label={t("league.demoteZone")}
                                    />
                                )}

                                <div className="text-right">
                                    <p className="text-xs font-black text-foreground">
                                        {row.weekly_xp.toLocaleString()}
                                    </p>
                                    <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-tighter">
                                        {t("league.xp")}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="p-8 text-center">
                        <p className="text-xs text-muted-foreground italic">{t("league.emptyDescription")}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
