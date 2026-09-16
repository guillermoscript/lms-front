"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { BookOpen, User } from "lucide-react";
import { useTranslations } from 'next-intl';

interface CourseCardProps {
    course: {
        course_id: number;
        title: string;
        description: string | null;
        thumbnail_url: string | null;
        category: { id: number; name: string } | null;
        author: { id: string; full_name: string; avatar_url: string | null } | null;
        lessonCount: number;
        price: number | null;
        currency: string | null;
    };
}

export function CourseCard({ course }: CourseCardProps) {
    const t = useTranslations('coursesCatalog.courseCard');

    const isFree = course.price === null || course.price === 0;
    const priceDisplay = isFree ? t('free') : `$${course.price}`;

    return (
        <Link href={`/courses/${course.course_id}`} className="block group">
            <Card className="flex flex-col overflow-hidden hover:ring-foreground/20 transition-all duration-200 shadow-lg hover:shadow-xl h-full">
                {/* Image */}
                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                    {course.thumbnail_url ? (
                        <img
                            src={course.thumbnail_url}
                            alt={course.title}
                            width={400}
                            height={225}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center bg-muted">
                            <BookOpen className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
                        </div>
                    )}

                    {/* Category badge — floats over the uploaded thumbnail, so the
                        black scrim, white ink and white hairline stay hardcoded:
                        they sit on arbitrary photography, not on a themed surface. */}
                    {course.category && (
                        <div className="absolute top-3 left-3">
                            <span className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-medium text-white border border-white/10">
                                {course.category.name}
                            </span>
                        </div>
                    )}

                    {/* Price badge — the paid branch is the same overlay-on-image
                        scrim as the category badge and stays hardcoded for the same
                        reason; the free branch is a status, so it is tokenised. */}
                    <div className="absolute top-3 right-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${isFree
                                ? 'bg-success text-success-foreground border-success/30'
                                : 'bg-black/70 backdrop-blur-md text-white border-white/10'
                            }`}>
                            {priceDisplay}
                        </span>
                    </div>
                </div>

                <CardContent className="flex-1 p-5 space-y-3">
                    {/* Title */}
                    <h3 className="line-clamp-2 text-base font-semibold group-hover:text-brand-text transition-colors duration-150 leading-snug text-pretty">
                        {course.title}
                    </h3>

                    {/* Description */}
                    {course.description && (
                        <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                            {course.description}
                        </p>
                    )}

                    {/* Meta: author + lessons */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                        {course.author && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                                <div className="w-5 h-5 rounded-full bg-muted overflow-hidden flex-shrink-0">
                                    {course.author.avatar_url ? (
                                        <img src={course.author.avatar_url} alt="" width={20} height={20} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                                        </div>
                                    )}
                                </div>
                                <span className="truncate min-w-0">{course.author.full_name}</span>
                            </div>
                        )}
                        {course.lessonCount > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{t('lessons', { count: course.lessonCount })}</span>
                            </div>
                        )}
                    </div>
                </CardContent>

                <CardFooter className="px-5 pb-5 pt-0 mt-auto">
                    <Button variant="secondary" className="w-full text-xs font-medium h-9">
                        {t('viewCourse')}
                    </Button>
                </CardFooter>
            </Card>
        </Link>
    );
}
