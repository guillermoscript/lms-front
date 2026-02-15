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
        <div className="flex items-center gap-2 md:gap-6 bg-background/50 backdrop-blur-md border border-border/50 rounded-2xl p-1 md:p-1.5 shadow-sm hover:shadow-md transition-all duration-300">
            {/* Level & XP Section */}
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group">
                <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-yellow-500/20 blur-lg rounded-full group-hover:bg-yellow-500/30 transition-all" />
                    <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <IconStar size={18} className="text-white fill-white/20" />
                    </div>
                    <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-foreground text-[10px] font-bold flex items-center justify-center text-background border border-background">
                        {summary.level}
                    </div>
                </div>
                <div className="hidden sm:flex flex-col gap-1 w-24">
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

            <div className="w-px h-6 bg-border hidden md:block" />

            {/* Streak Section */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group">
                <div className={cn(
                    "p-1.5 rounded-lg transition-all",
                    summary.streak.current > 0 ? "bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20" : "bg-muted text-muted-foreground"
                )}>
                    <IconFlame size={18} className={cn(summary.streak.current > 0 && "fill-orange-500/20")} />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-black leading-none">{summary.streak.current}</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">{t('streak')}</span>
                </div>
            </div>

            <div className="w-px h-6 bg-border hidden md:block" />

            {/* Coins Section */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500 group-hover:bg-cyan-500/20 transition-all">
                    <IconCoin size={18} className="fill-cyan-500/20" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-black leading-none">{summary.coins}</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">{t('coins')}</span>
                </div>
            </div>

            <Link href="/dashboard/student/profile#achievements" className="hidden lg:flex items-center justify-center p-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                <IconTrophy size={20} />
            </Link>
        </div>
    );
}
