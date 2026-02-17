"use client";

import { useGamification } from "@/lib/hooks/use-gamification";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import {
    IconTrophy,
    IconFlame,
    IconCoin,
    IconStar,
    IconChevronRight
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function GamificationHeaderCard() {
    const { summary, loading } = useGamification();
    const t = useTranslations('components.gamification');

    if (loading) {
        return (
            <div className="flex items-center gap-6 px-4 py-2 bg-muted/50 rounded-2xl border border-border animate-pulse">
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
        );
    }

    if (!summary) return null;

    return (
        <div className="flex items-center gap-1.5 md:gap-4 bg-background/50 backdrop-blur-md border border-border/50 rounded-2xl p-1 md:p-1.5 shadow-sm hover:shadow-md transition-all duration-300 max-w-full overflow-hidden">
            {/* Level & XP Section */}
            <div className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group shrink-0">
                <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-yellow-500/20 blur-lg rounded-full group-hover:bg-yellow-500/30 transition-all" />
                    <div className="relative h-7 w-7 md:h-8 md:w-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <IconStar size={16} className="text-white fill-white/20 md:hidden" />
                        <IconStar size={18} className="text-white fill-white/20 hidden md:block" />
                    </div>
                    <div className="absolute -top-1 -right-1 h-3.5 w-3.5 md:h-4 md:w-4 rounded-full bg-foreground text-[8px] md:text-[10px] font-bold flex items-center justify-center text-background border border-background">
                        {summary.level}
                    </div>
                </div>
                {/* Mobile Level Text (Horizontal fallback when progress bar is hidden) */}
                <div className="flex sm:hidden flex-col gap-0">
                    <span className="text-[10px] font-black leading-none">Lvl {summary.level}</span>
                </div>
                {/* Desktop Progress Section */}
                <div className="hidden sm:flex flex-col gap-1 w-20 md:w-24">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('level')} {summary.level}</span>
                        <span className="text-[10px] font-medium text-muted-foreground">{summary.xp_progress.percentage}%</span>
                    </div>
                    <Progress value={summary.xp_progress.percentage} className="w-full gap-0">
                        <ProgressTrack className="h-1.5 bg-muted">
                            <ProgressIndicator className="bg-gradient-to-r from-yellow-400 to-orange-500" />
                        </ProgressTrack>
                    </Progress>
                </div>
            </div>

            <div className="w-px h-6 bg-border/50 shrink-0" />

            {/* Streak Section */}
            <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group">
                <div className={cn(
                    "p-1 md:p-1.5 rounded-lg transition-all",
                    summary.streak.current > 0 ? "bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20" : "bg-muted text-muted-foreground"
                )}>
                    <IconFlame size={16} className={cn("md:hidden", summary.streak.current > 0 && "fill-orange-500/20")} />
                    <IconFlame size={18} className={cn("hidden md:block", summary.streak.current > 0 && "fill-orange-500/20")} />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-black leading-none">{summary.streak.current}</span>
                    <span className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase tracking-tight hidden sm:block">{t('streak')}</span>
                </div>
            </div>

            <div className="w-px h-6 bg-border/50 shrink-0" />

            {/* Coins Section */}
            <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group">
                <div className="p-1 md:p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500 group-hover:bg-cyan-500/20 transition-all">
                    <IconCoin size={16} className="fill-cyan-500/20 md:hidden" />
                    <IconCoin size={18} className="fill-cyan-500/20 hidden md:block" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-black leading-none">{summary.coins}</span>
                    <span className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase tracking-tight hidden sm:block">{t('coins')}</span>
                </div>
            </div>

            {summary.features?.achievements && (
                <Link href="/dashboard/student/profile#achievements" className="flex items-center justify-center p-1.5 md:p-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground transition-all shrink-0">
                    <IconTrophy size={18} className="md:hidden" />
                    <IconTrophy size={20} className="hidden md:block" />
                </Link>
            )}
        </div>
    );
}
