"use client";

import { useGamificationSummary } from "@/lib/hooks/use-gamification-summary";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import {
    IconTrophy,
    IconFlame,
    IconCoin,
    IconStar,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function GamificationHeaderCard() {
    const { summary, loading } = useGamificationSummary();
    const t = useTranslations('components.gamification');

    if (loading) {
        return (
            <div className="flex items-center gap-4 px-3 py-1.5 bg-muted/50 rounded-xl border border-border">
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-6 w-16 rounded-md" />
                <Skeleton className="h-6 w-16 rounded-md" />
            </div>
        );
    }

    if (!summary) return null;

    return (
        <div className="flex items-center gap-1 md:gap-2 bg-muted/50 border border-border rounded-xl p-1 md:p-1.5 max-w-full overflow-hidden">
            {/* Level & XP */}
            <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-2.5 py-1 rounded-lg hover:bg-accent/50 transition-colors shrink-0">
                <div className="relative flex items-center justify-center">
                    <div className="h-6 w-6 md:h-7 md:w-7 rounded-md bg-primary/15 flex items-center justify-center">
                        <IconStar className="size-3.5 md:size-4 text-primary" />
                    </div>
                    <div className="absolute -top-1 -right-1.5 h-3.5 w-3.5 rounded-full bg-foreground text-[8px] font-bold flex items-center justify-center text-background border border-background">
                        {summary.level}
                    </div>
                </div>
                <div className="hidden sm:flex flex-col gap-0.5 w-20 md:w-24">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('level')} {summary.level}</span>
                        <span className="text-[10px] text-muted-foreground">{summary.xp_progress.percentage}%</span>
                    </div>
                    <Progress value={summary.xp_progress.percentage} className="w-full gap-0">
                        <ProgressTrack className="h-1.5 bg-muted">
                            <ProgressIndicator className="bg-primary" />
                        </ProgressTrack>
                    </Progress>
                </div>
                <span className="sm:hidden text-[10px] font-bold leading-none">Lvl {summary.level}</span>
            </div>

            <div className="w-px h-5 bg-border shrink-0" />

            {/* Streak */}
            <div className="flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-lg hover:bg-accent/50 transition-colors">
                <div className={cn(
                    "p-1 rounded-md transition-colors",
                    summary.streak.current > 0 ? "bg-orange-500/10 text-orange-500" : "bg-muted text-muted-foreground"
                )}>
                    <IconFlame className="size-3.5 md:size-4" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold leading-none">{summary.streak.current}</span>
                    <span className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-tight hidden sm:block">{t('streak')}</span>
                </div>
            </div>

            <div className="w-px h-5 bg-border shrink-0" />

            {/* Coins */}
            <div className="flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-lg hover:bg-accent/50 transition-colors">
                <div className="p-1 rounded-md bg-primary/10 text-primary transition-colors">
                    <IconCoin className="size-3.5 md:size-4" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold leading-none">{summary.coins}</span>
                    <span className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-tight hidden sm:block">{t('coins')}</span>
                </div>
            </div>

            {summary.features?.achievements && (
                <Link href="/dashboard/student/profile#achievements" className="flex items-center justify-center p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label={t('achievements')}>
                    <IconTrophy className="size-4 md:size-[18px]" />
                </Link>
            )}
        </div>
    );
}
