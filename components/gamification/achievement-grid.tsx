"use client";

import { useEffect } from "react";
import { useGamification, Achievement } from "@/lib/hooks/use-gamification";
import { Skeleton } from "@/components/ui/skeleton";
import { IconLock, IconCheck, IconAward } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useTranslations } from "next-intl";

export function AchievementGrid() {
    const { allAchievements, achievementsLoading, refreshAchievements } = useGamification();

    useEffect(() => {
        refreshAchievements();
    }, []);
    const t = useTranslations('components.gamification');

    if (achievementsLoading && allAchievements.length === 0) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-32 rounded-2xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allAchievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
        </div>
    );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
    const t = useTranslations('components.gamification');
    const isEarned = !!achievement.earned_at;

    const tierColors = {
        bronze: "from-amber-700 to-amber-500",
        silver: "from-slate-400 to-slate-300",
        gold: "from-yellow-500 to-yellow-300",
        platinum: "from-indigo-500 to-cyan-400"
    };

    const tierShadows = {
        bronze: "shadow-amber-500/10",
        silver: "shadow-slate-400/10",
        gold: "shadow-yellow-500/10",
        platinum: "shadow-cyan-400/10"
    };

    return (
        <div className={cn(
            "relative group overflow-hidden rounded-2xl border transition-all duration-300 p-4",
            isEarned
                ? "bg-card border-border shadow-sm hover:shadow-md"
                : "bg-muted/30 border-dashed border-border/50 grayscale opacity-70"
        )}>
            <div className="flex items-start gap-4">
                <div className={cn(
                    "relative flex-shrink-0 h-16 w-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 duration-500",
                    tierColors[achievement.tier as keyof typeof tierColors],
                    tierShadows[achievement.tier as keyof typeof tierShadows]
                )}>
                    {/* Achievement Icon */}
                    <div className="text-white">
                        {isEarned ? (
                            <span className="text-2xl">{achievement.icon}</span>
                        ) : (
                            <IconLock size={24} className="text-white/50" />
                        )}
                    </div>

                    {/* Badge indicator */}
                    {isEarned && (
                        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center border-2 border-background shadow-sm">
                            <IconCheck size={12} className="text-white stroke-[4]" />
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            isEarned ? "text-primary" : "text-muted-foreground"
                        )}>
                            {t(`achievements.${achievement.tier}`)}
                        </span>
                        {isEarned && achievement.earned_at && (
                            <span className="text-[10px] text-muted-foreground">
                                {format(new Date(achievement.earned_at), 'MMM d, yyyy')}
                            </span>
                        )}
                    </div>
                    <h4 className="font-bold text-sm leading-tight mb-1 truncate group-hover:text-primary transition-colors">
                        {achievement.title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {achievement.description}
                    </p>
                </div>
            </div>

            {/* Rewards Tooltip-like section */}
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    <span className="text-[10px] font-bold text-muted-foreground">{achievement.xp_reward} XP</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    <span className="text-[10px] font-bold text-muted-foreground">{Math.floor(achievement.xp_reward / 10)} {t('coins')}</span>
                </div>
            </div>

            {/* Background Decorative element */}
            <div className={cn(
                "absolute -bottom-2 -right-2 opacity-[0.03] transition-transform group-hover:scale-150 duration-700",
                isEarned ? "text-primary" : "text-muted-foreground"
            )}>
                <IconAward size={80} />
            </div>
        </div>
    );
}
