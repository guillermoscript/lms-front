"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    IconRocket,
    IconTrophy,
    IconFlame,
    IconArrowRight,
    IconSparkles
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface DashboardSummaryProps {
    user: any;
    overallProgress: number;
    completedLessons: number;
    nextLesson?: any;
}

export function DashboardSummary({
    user,
    overallProgress,
    completedLessons,
    nextLesson
}: DashboardSummaryProps) {
    const t = useTranslations('components.dashboardSummary');
    const userName = user?.user_metadata?.full_name || "Achiever";

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Welcome Banner */}
            <Card className="lg:col-span-2 overflow-hidden border-none shadow-soft bg-primary text-primary-foreground group">
                <CardContent className="p-8 md:p-10 relative">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                        <IconRocket size={200} stroke={1} />
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="space-y-2">
                            <Badge variant="outline" className="text-primary-foreground border-primary-foreground/30 bg-primary-foreground/10 px-3 py-1 font-bold tracking-widest uppercase text-[10px]">
                                {t('yourProgress')}
                            </Badge>
                            <h1 className="text-3xl md:text-4xl font-black">
                                {t('welcomeBack', { userName })} <span className="inline-block animate-bounce-subtle">👋</span>
                            </h1>
                            <p className="text-primary-foreground/80 max-w-md font-medium">
                                {t('progressMessage', { count: completedLessons })}
                            </p>
                        </div>

                        <div className="pt-4 flex flex-col md:flex-row items-start md:items-end gap-8">
                            <div className="flex-1 w-full space-y-3">
                                <div className="flex justify-between text-sm font-black uppercase tracking-widest text-primary-foreground/90">
                                    <span>{t('courseCompletion')}</span>
                                    <span>{overallProgress}%</span>
                                </div>
                                <div className="h-3 w-full bg-primary-foreground/10 rounded-full overflow-hidden border border-primary-foreground/5 backdrop-blur-sm">
                                    <div
                                        className="h-full bg-primary-foreground transition-all duration-1000 ease-out"
                                        style={{ width: `${overallProgress}%` }}
                                    />
                                </div>
                            </div>

                            {nextLesson && (
                                <Button className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 h-14 px-8 font-black gap-2 shrink-0 shadow-xl transition-all hover:translate-y-[-2px]">
                                    {t('continueLearning')}
                                    <IconArrowRight size={18} />
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Sidebar */}
            <div className="grid grid-cols-1 gap-6">
                <Card className="border-none shadow-soft bg-primary text-primary-foreground overflow-hidden relative group">
                    <CardContent className="p-6 flex flex-col justify-between h-full">
                        <div className="absolute top-2 right-2 opacity-20">
                            <IconFlame size={80} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-foreground/80">{t('dailyStreak')}</p>
                            <h3 className="text-4xl font-black">{t('daysCount', { count: 12 })}</h3>
                        </div>
                        <p className="text-sm font-medium text-primary-foreground/80 mt-4 italic">
                            {t('topLearner')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-soft bg-primary text-primary-foreground overflow-hidden relative group">
                    <CardContent className="p-6 flex flex-col justify-between h-full">
                        <div className="absolute top-2 right-2 opacity-20 transition-transform group-hover:rotate-12">
                            <IconTrophy size={80} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-foreground/80">{t('achievements')}</p>
                            <h3 className="text-4xl font-black">{t('badgesCount', { count: 24 })}</h3>
                        </div>
                        <div className="flex gap-1 mt-4">
                            <div className="h-6 w-6 rounded-full bg-primary-foreground/20 flex items-center justify-center text-[10px] font-bold">🥇</div>
                            <div className="h-6 w-6 rounded-full bg-primary-foreground/20 flex items-center justify-center text-[10px] font-bold">🎯</div>
                            <div className="h-6 w-6 rounded-full bg-primary-foreground/20 flex items-center justify-center text-[10px] font-bold">⚡</div>
                            <div className="h-6 w-6 rounded-full bg-primary-foreground/20 flex items-center justify-center text-[10px] font-bold">+4</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
