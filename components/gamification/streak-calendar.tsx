"use client";

import { useGamificationSummary } from "@/lib/hooks/use-gamification-summary";
import { cn } from "@/lib/utils";
import { format, subDays, isSameDay, startOfWeek, addDays } from "date-fns";
import { IconFlame, IconCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export function StreakCalendar() {
    const { summary, loading } = useGamificationSummary();
    const t = useTranslations('components.gamification');

    if (loading || !summary) {
        return <div className="h-24 w-full bg-muted animate-pulse rounded-2xl" />;
    }

    // Get the last 7 days
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));

    // In a real app, we'd fetch actual activity dates. 
    // For now, we'll simulate based on last_activity and current_streak
    const lastActivity = summary.streak.last_activity ? new Date(summary.streak.last_activity) : null;
    const activeDays = summary.streak.current > 0 ? Array.from({ length: summary.streak.current }, (_, i) => subDays(lastActivity || today, i)) : [];

    return (
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                        <IconFlame size={18} fill={summary.streak.current > 0 ? "currentColor" : "none"} />
                    </div>
                    <h3 className="font-bold text-sm">{t('activeStreak')}</h3>
                </div>
                <div className="text-right">
                    <span className="text-sm font-black text-foreground">{summary.streak.current}</span>
                    <span className="text-[10px] text-muted-foreground uppercase ml-1">{t('days')}</span>
                </div>
            </div>

            <div className="flex justify-between items-center gap-1">
                {days.map((day) => {
                    const isActive = activeDays.some(ad => isSameDay(ad, day));
                    const isToday = isSameDay(day, today);

                    return (
                        <div key={day.toISOString()} className="flex flex-col items-center gap-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                {format(day, 'eee')[0]}
                            </span>
                            <div className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center transition-all duration-300",
                                isActive
                                    ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/20"
                                    : isToday
                                        ? "border-2 border-orange-500/50 text-orange-500"
                                        : "bg-muted text-muted-foreground/30"
                            )}>
                                {isActive ? (
                                    <IconCheck size={14} className="stroke-[4]" />
                                ) : (
                                    <span className="text-[10px] font-bold">{format(day, 'd')}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {summary.streak.freezes_available > 0 && (
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('availableFreezes')}</span>
                    <div className="flex gap-1">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-2 w-2 rounded-full",
                                    i < summary.streak.freezes_available ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" : "bg-muted"
                                )}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
