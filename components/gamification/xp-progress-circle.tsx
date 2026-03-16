"use client";

import { useGamificationSummary } from "@/lib/hooks/use-gamification-summary";
import { cn } from "@/lib/utils";
import { IconStar } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

interface XPProgressCircleProps {
    size?: number;
    strokeWidth?: number;
    className?: string;
}

export function XPProgressCircle({
    size = 120,
    strokeWidth = 8,
    className
}: XPProgressCircleProps) {
    const { summary, loading } = useGamificationSummary();
    const t = useTranslations('components.gamification');

    if (loading || !summary) {
        return (
            <div className={cn("relative flex items-center justify-center animate-pulse", className)} style={{ width: size, height: size }}>
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
            </div>
        );
    }

    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (summary.xp_progress.percentage / 100) * circumference;

    return (
        <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
            {/* Background Circle */}
            <svg className="transform -rotate-90" width={size} height={size}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    className="text-muted/30"
                />
                {/* Progress Circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    style={{ strokeDashoffset: offset }}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-1000 ease-out"
                />
            </svg>

            {/* Content in the middle */}
            <div className="absolute flex flex-col items-center justify-center text-center">
                <div className="relative">
                    <div className="absolute inset-0 bg-yellow-500/20 blur-md rounded-full" />
                    <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 mb-1">
                        <IconStar size={20} className="text-white fill-white/20" />
                    </div>
                </div>
                <span className="text-2xl font-black leading-none">{summary.level}</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{t('level')}</span>
            </div>

            {/* XP indicator tooltip-like */}
            <div className="absolute -bottom-2 bg-popover border border-border px-2 py-0.5 rounded-full shadow-sm">
                <span className="text-[9px] font-bold whitespace-nowrap">
                    {summary.xp_progress.current} / {summary.xp_progress.required} XP
                </span>
            </div>
        </div>
    );
}
