"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Star, User } from "lucide-react";
import { useTranslations } from 'next-intl';

interface CourseCardProps {
    course: {
        course_id: number;
        title: string;
        description: string | null;
        thumbnail_url: string | null;
        price?: number | null;
        level?: string;
        slug?: string;
        rating?: number;
        reviewCount?: number;
        duration?: string;
        instructor?: string;
        category?: string;
    };
}

export function CourseCard({ course }: CourseCardProps) {
    const t = useTranslations('coursesCatalog.courseCard');

    // Default values for missing data using translations
    const rating = course.rating || 4.8;
    const reviewCount = course.reviewCount || 120;
    const duration = course.duration || t('defaults.duration');
    const instructor = course.instructor || t('defaults.instructor');
    const category = course.category || t('defaults.category');

    return (
        <Card className="flex flex-col overflow-hidden bg-[#18181b]/60 border-zinc-800/50 hover:border-blue-500/30 transition-all duration-300 group shadow-lg hover:shadow-blue-500/5 backdrop-blur-sm">
            {/* Image Section */}
            <div className="relative aspect-video w-full overflow-hidden bg-zinc-800">
                {course.thumbnail_url ? (
                    <img
                        src={course.thumbnail_url}
                        alt={course.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-zinc-500 bg-gradient-to-br from-zinc-900 to-zinc-950">
                        <User className="w-12 h-12 opacity-10" />
                    </div>
                )}

                {/* Overlay Badges */}
                <div className="absolute top-3 left-3">
                    {course.course_id % 2 === 0 && (
                        <Badge className="bg-blue-600 hover:bg-blue-500 text-white font-bold border-0 shadow-lg">
                            {t('popular')}
                        </Badge>
                    )}
                </div>

                <div className="absolute bottom-3 right-3">
                    <div className="bg-black/70 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white flex items-center gap-1.5 border border-white/10">
                        <Clock className="w-3 h-3 text-blue-400" />
                        {duration}
                    </div>
                </div>
            </div>

            <CardContent className="flex-1 p-5 space-y-4">
                {/* Meta Row: Category & Rating */}
                <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-bold">
                    <span className="text-blue-400">{category}</span>
                    <div className="flex items-center text-yellow-500 gap-1 bg-yellow-500/5 px-2 py-0.5 rounded-full">
                        <Star className="w-3 h-3 fill-current" />
                        <span className="text-zinc-200">{rating}</span>
                        <span className="text-zinc-500 font-medium">({reviewCount})</span>
                    </div>
                </div>

                {/* Title */}
                <h3 className="line-clamp-2 text-lg font-bold text-white group-hover:text-blue-400 transition-colors leading-tight min-h-[3.5rem]">
                    {course.title}
                </h3>

                {/* Instructor */}
                <div className="flex items-center gap-2.5 text-xs text-zinc-400">
                    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-border/50 flex items-center justify-center overflow-hidden shadow-inner">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                    <span className="font-medium">{instructor}</span>
                </div>
            </CardContent>

            <CardFooter className="p-5 pt-0 mt-auto flex items-center justify-between border-t border-zinc-800/30 pt-4 bg-white/[0.02]">
                <div>
                    <span className="text-xl font-bold text-white">
                        {course.price ? `$${course.price}` : t('free')}
                    </span>
                </div>

                <Link href={`/courses/${course.course_id}`}>
                    <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-9 font-bold px-4 rounded-lg transition-all active:scale-95">
                        {t('getStarted')}
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}
