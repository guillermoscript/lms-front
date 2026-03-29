"use client";

import { useGamificationSummary } from "@/lib/hooks/use-gamification-summary";
import { IconCoins, IconFlame } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export function ProfileGamificationStats() {
    const { summary, loading } = useGamificationSummary();
    const t = useTranslations('components.gamification');

    if (loading || !summary) {
        return (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-muted/30 animate-pulse">
                <div className="h-10 bg-muted rounded-xl" />
                <div className="h-10 bg-muted rounded-xl" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-muted/30">
            <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-amber-500">
                    <IconCoins size={14} className="stroke-[3]" />
                    <span className="text-[10px] font-black uppercase tracking-wider">{t('coins')}</span>
                </div>
                <p className="text-xl font-black tabular-nums tracking-tight">
                    {summary.coins.toLocaleString()}
                </p>
            </div>
            <div className="space-y-1 text-right">
                <div className="flex items-center justify-end gap-1.5 text-orange-500">
                    <IconFlame size={14} className="stroke-[3]" />
                    <span className="text-[10px] font-black uppercase tracking-wider">{t('streak')}</span>
                </div>
                <p className="text-xl font-black tabular-nums tracking-tight">
                    {summary.streak.current}
                </p>
            </div>
        </div>
    );
}
