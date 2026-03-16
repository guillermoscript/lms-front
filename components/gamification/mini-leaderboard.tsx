"use client";

import { useEffect } from "react";
import { useGamificationSummary } from "@/lib/hooks/use-gamification-summary";
import { useLeaderboard } from "@/lib/hooks/use-leaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTrophy, IconMedal, IconTrendingUp, IconLock } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function MiniLeaderboard() {
    const { summary } = useGamificationSummary();
    const { leaderboard, loading: leaderboardLoading, fetch: fetchLeaderboard } = useLeaderboard();

    useEffect(() => {
        if (summary?.features?.leaderboard) {
            fetchLeaderboard();
        }
    }, [summary?.features?.leaderboard]);
    const t = useTranslations('components.gamification');

    // Show upgrade prompt if leaderboard feature is not available
    if (summary && !summary.features?.leaderboard) {
        return (
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-500">
                            <IconTrophy size={18} />
                        </div>
                        <h3 className="font-bold text-sm tracking-tight">{t('leaderboardTitle')}</h3>
                    </div>
                    <IconLock size={16} className="text-muted-foreground" />
                </div>
                <div className="p-6 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
                        <IconTrophy size={24} className="text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-bold">{t('upgrade.leaderboardLocked')}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('upgrade.upgradeDescription')}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (leaderboardLoading && leaderboard.length === 0) {
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

    return (
        <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-500">
                        <IconTrophy size={18} />
                    </div>
                    <h3 className="font-bold text-sm tracking-tight">{t('leaderboardTitle')}</h3>
                </div>
                <IconTrendingUp size={16} className="text-muted-foreground" />
            </div>

            <div className="p-2 space-y-1">
                {leaderboard.length > 0 ? (
                    leaderboard.map((user, index) => (
                        <div
                            key={user.user_id}
                            className={cn(
                                "flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-accent/50 group",
                                index === 0 && "bg-yellow-500/5 border border-yellow-500/10"
                            )}
                        >
                            <div className="flex items-center justify-center w-6 text-xs font-bold text-muted-foreground group-hover:text-foreground">
                                {index === 0 ? (
                                    <IconMedal size={16} className="text-yellow-500" />
                                ) : index === 1 ? (
                                    <IconMedal size={16} className="text-slate-400" />
                                ) : index === 2 ? (
                                    <IconMedal size={16} className="text-amber-600" />
                                ) : (
                                    index + 1
                                )}
                            </div>

                            <Avatar className="h-8 w-8 border border-border/50">
                                <AvatarImage src={user.avatar_url || ""} />
                                <AvatarFallback className="text-[10px] font-bold">
                                    {user.full_name?.[0]?.toUpperCase() || "U"}
                                </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">
                                    {user.full_name || user.username || 'Anonymous'}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Lvl {user.level}
                                </p>
                            </div>

                            <div className="text-right">
                                <p className="text-xs font-black text-foreground">
                                    {user.xp.toLocaleString()}
                                </p>
                                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-tighter">
                                    XP
                                </p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center">
                        <p className="text-xs text-muted-foreground italic">{t('leaderboard.empty')}</p>
                    </div>
                )}
            </div>

            <div className="p-3 bg-muted/30 border-t border-border">
                <button className="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                    {t('viewFullRankings')}
                </button>
            </div>
        </div>
    );
}
