"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { IconClock, IconPlayerPlay, IconChevronRight } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface ActivitySectionProps {
    lessons: any[];
}

export function ActivitySection({ lessons }: ActivitySectionProps) {
    const t = useTranslations('components.activitySection');
    if (!lessons || lessons.length === 0) return null;

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-1 bg-primary rounded-full" />
                    <h2 className="text-2xl font-black tracking-tight">{t('title')}</h2>
                </div>
                <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 px-3 py-1 font-bold">
                    {t('recentSessions', { count: lessons.length })}
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {lessons.map((lesson) => (
                    <Link
                        key={lesson.view_id}
                        href={`/dashboard/student/courses/${lesson.lesson_course_id}/lessons/${lesson.lesson_id}`}
                        className="group"
                    >
                        <Card className="border-none shadow-soft hover:shadow-xl transition-all duration-300 overflow-hidden bg-card">
                            <div className="aspect-video relative overflow-hidden">
                                {lesson.lesson_image ? (
                                    <img
                                        src={lesson.lesson_image}
                                        alt={lesson.lesson_title}
                                        className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-muted flex items-center justify-center">
                                        <IconPlayerPlay size={40} className="text-muted-foreground/20" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                                    <div className="bg-white/20 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1.5 text-white text-[10px] font-black uppercase tracking-widest border border-white/20">
                                        <IconClock size={12} />
                                        {t('lastViewed', { date: new Date(lesson.viewed_at).toLocaleDateString() })}
                                    </div>
                                </div>
                            </div>

                            <CardContent className="p-5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-black uppercase">
                                        {t('part', { sequence: lesson.lesson_sequence })}
                                    </div>
                                </div>
                                <h3 className="font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                                    {lesson.lesson_title}
                                </h3>
                                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                                    {lesson.lesson_description || t('defaultDescription')}
                                </p>

                                <div className="pt-2 flex items-center justify-between group-hover:translate-x-1 transition-transform">
                                    <span className="text-xs font-black text-primary uppercase tracking-widest">{t('resume')}</span>
                                    <IconChevronRight size={16} className="text-primary" />
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </section>
    );
}
