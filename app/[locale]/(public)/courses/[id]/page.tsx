import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    PlayCircle,
    BookOpen,
    ChevronRight,
    Calendar,
    CheckCircle2,
    Clock,
    Infinity,
    Smartphone,
    Award,
    User
} from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { getTranslations } from 'next-intl/server';
import { getCurrentUserId, getCurrentTenantId } from '@/lib/supabase/tenant'

export const dynamic = 'force-dynamic';

interface Lesson {
    id: number;
    title: string;
    sequence: number;
    description: string | null;
}

export default async function CourseDetailsPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const t = await getTranslations('coursePublicDetails');
    const tenantId = await getCurrentTenantId();
    // Use admin client for public reads — anon JWT has no tenant_id claim,
    // so RLS get_tenant_id() defaults to wrong tenant for non-default tenants.
    const adminClient = createAdminClient();

    const userId = await getCurrentUserId()
    // Fetch course with lessons and category
    const { data: course, error } = await adminClient
        .from("courses")
        .select(`
            *,
            lessons (
                id,
                title,
                sequence,
                description
            ),
            category:course_categories (
                id,
                name
            )
        `)
        .eq("course_id", parseInt(params.id))
        .eq("status", "published")
        .eq("tenant_id", tenantId)
        .single();

    if (error || !course) {
        notFound();
    }

    // Fetch author separately (profiles is global, no tenant_id)
    let author = null;
    if (course.author_id) {
        const { data: authorData } = await adminClient
            .from("profiles")
            .select("id, full_name, avatar_url, bio")
            .eq("id", course.author_id)
            .single();
        author = authorData;
    }

    // Sort lessons by sequence
    const lessons = course.lessons?.sort((a: Lesson, b: Lesson) => a.sequence - b.sequence) || [];
    const totalLessons = lessons.length;
    const estimatedHours = Math.floor(totalLessons * 10 / 60);
    const estimatedMinutes = (totalLessons * 10) % 60;

    // Check user's enrollment (uses RLS client — only works for logged-in users)
    let hasAccess = false;
    if (userId) {
        const supabase = await createClient();
        const { data: enrollment } = await supabase
            .from('enrollments')
            .select('enrollment_id')
            .eq('user_id', userId)
            .eq('course_id', parseInt(params.id))
            .eq('status', 'active')
            .maybeSingle();

        if (enrollment) {
            hasAccess = true;
        }
    }

    // Fetch product for pricing
    const { data: productCourses } = await adminClient
        .from('product_courses')
        .select('product:products(*)')
        .eq('course_id', parseInt(params.id))
        .limit(1);

    const courseProduct = productCourses?.[0]?.product as any;
    const isFree = courseProduct ? parseFloat(courseProduct.price) === 0 : true;
    const priceDisplay = isFree ? t('pricing.free') : `$${courseProduct.price}`;

    const instructor = author ? {
        name: author.full_name || t('sections.instructor.defaultBio'),
        avatar_url: author.avatar_url,
        bio: author.bio || t('sections.instructor.defaultBio')
    } : null;

    // Learning objectives from lesson descriptions
    const whatYoullLearn = lessons
        .filter((lesson: Lesson) => lesson.description)
        .slice(0, 6)
        .map((lesson: Lesson) => lesson.description);

    const formattedDate = course.published_at
        ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(course.published_at))
        : null;

    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="bg-[#18181b]/50 border-b border-zinc-800">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-sm text-zinc-400">
                    <Link href="/" className="hover:text-cyan-400 transition-colors duration-150">{t('breadcrumbs.home')}</Link>
                    <ChevronRight className="w-3 h-3" aria-hidden="true" />
                    <Link href="/courses" className="hover:text-cyan-400 transition-colors duration-150">{t('breadcrumbs.courses')}</Link>
                    {course.category && (
                        <>
                            <ChevronRight className="w-3 h-3" aria-hidden="true" />
                            <span className="text-zinc-300">{(course.category as any).name}</span>
                        </>
                    )}
                    <ChevronRight className="w-3 h-3" aria-hidden="true" />
                    <span className="text-cyan-400 truncate max-w-[200px]" aria-current="page">{course.title}</span>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="bg-[#18181b] border-b border-zinc-800 py-12 lg:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl">
                        {course.category && (
                            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-4">
                                {(course.category as any).name}
                            </span>
                        )}

                        <h1 className="text-3xl lg:text-5xl font-bold mb-4 tracking-tight leading-tight text-white text-balance">
                            {course.title}
                        </h1>

                        {course.description && (
                            <p className="text-lg text-zinc-300 mb-8 leading-relaxed max-w-3xl text-pretty">
                                {course.description}
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-300">
                            {totalLessons > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <BookOpen className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                    <span>{t('hero.lessons', { count: totalLessons })}</span>
                                </div>
                            )}
                            {(estimatedHours > 0 || estimatedMinutes > 0) && (
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                    <span>{t('hero.duration', { h: estimatedHours, m: estimatedMinutes })}</span>
                                </div>
                            )}
                            {formattedDate && (
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                    <span>{t('hero.published', { date: formattedDate })}</span>
                                </div>
                            )}
                        </div>

                        {instructor && (
                            <div className="mt-8 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                                    {instructor.avatar_url ? (
                                        <img src={instructor.avatar_url} alt={instructor.name} width={40} height={40} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-5 h-5 text-zinc-500" aria-hidden="true" />
                                        </div>
                                    )}
                                </div>
                                <span className="text-zinc-200">{t('hero.createdBy', { name: instructor.name })}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-12">

                        {/* What you'll learn */}
                        {whatYoullLearn.length > 0 && (
                            <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                                <h2 className="text-2xl font-bold mb-6 text-white text-balance">{t('sections.whatYoullLearn')}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                    {whatYoullLearn.map((item: string | null, i: number) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="mt-0.5 flex-shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                                            </div>
                                            <span className="text-zinc-200 text-sm leading-relaxed">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Course Content */}
                        <section>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-white">{t('sections.content.title')}</h2>
                            </div>
                            <div className="text-sm text-zinc-300 mb-4 flex gap-3">
                                <span>{t('sections.content.lectures', { count: lessons.length })}</span>
                                {(estimatedHours > 0 || estimatedMinutes > 0) && (
                                    <>
                                        <span aria-hidden="true">&middot;</span>
                                        <span>{t('sections.content.totalLength', { h: estimatedHours, m: estimatedMinutes })}</span>
                                    </>
                                )}
                            </div>

                            {lessons.length > 0 ? (
                                <Accordion className="w-full space-y-3">
                                    <AccordionItem value="lessons" className="border border-zinc-800 bg-zinc-900/30 rounded-lg px-4 overflow-hidden">
                                        <AccordionTrigger className="hover:no-underline py-4">
                                            <div className="flex items-center gap-4 text-left">
                                                <span className="font-bold text-white">{t('sections.content.allLessons')}</span>
                                                <span className="text-xs text-zinc-400 font-normal">{t('sections.content.lectures', { count: lessons.length })}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pb-4 space-y-1">
                                            {lessons.map((lesson: Lesson, index: number) => (
                                                <div key={lesson.id} className="flex items-center justify-between p-3 rounded-md hover:bg-zinc-800/50 transition-colors duration-150">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span className="text-xs text-zinc-400 font-mono w-6 text-right tabular-nums flex-shrink-0">{index + 1}</span>
                                                        <BookOpen className="w-4 h-4 text-zinc-400 flex-shrink-0" aria-hidden="true" />
                                                        <span className="text-sm text-zinc-200 truncate">{lesson.title}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            ) : (
                                <div className="text-center py-8 text-zinc-400">
                                    {t('sections.content.noLessons')}
                                </div>
                            )}
                        </section>

                        {/* About */}
                        {course.description && (
                            <section className="space-y-6">
                                <h2 className="text-2xl font-bold text-white">{t('sections.about')}</h2>
                                <div className="text-zinc-300 text-base leading-relaxed whitespace-pre-line">
                                    {course.description}
                                </div>
                            </section>
                        )}

                        {/* Instructor */}
                        {instructor && (
                            <section>
                                <h2 className="text-2xl font-bold mb-8 text-white">{t('sections.instructor.title')}</h2>
                                <div className="flex items-start gap-5 bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
                                    <div className="w-20 h-20 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0 ring-2 ring-zinc-700">
                                        {instructor.avatar_url ? (
                                            <img src={instructor.avatar_url} alt={instructor.name} width={80} height={80} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <User className="w-8 h-8 text-zinc-500" aria-hidden="true" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-lg font-bold text-white">{instructor.name}</div>
                                        <div className="text-sm text-zinc-400 mt-1">{t('sections.instructor.experience')}</div>
                                        {instructor.bio && (
                                            <p className="text-zinc-300 leading-relaxed mt-3 text-sm">
                                                {instructor.bio}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Right Column: Sticky Pricing Card */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-8 space-y-6">
                            <Card className="bg-[#18181b] border-zinc-800 shadow-2xl overflow-hidden">
                                {/* Thumbnail */}
                                <div className="relative aspect-video">
                                    {course.thumbnail_url ? (
                                        <img
                                            src={course.thumbnail_url}
                                            alt={course.title}
                                            width={400}
                                            height={225}
                                            className="w-full h-full object-cover brightness-75"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                                            <PlayCircle className="w-16 h-16 text-zinc-600" aria-hidden="true" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <PlayCircle className="w-14 h-14 text-white/80" aria-hidden="true" />
                                        <span className="mt-3 font-medium text-sm text-white/90">{t('pricing.preview')}</span>
                                    </div>
                                </div>

                                <CardContent className="p-6 space-y-6">
                                    {/* Price */}
                                    <div className="flex items-center justify-between">
                                        <div className="text-3xl font-bold text-white">{priceDisplay}</div>
                                        {courseProduct?.currency && (
                                            <div className="text-zinc-400 text-sm uppercase">{courseProduct.currency}</div>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <div className="space-y-3">
                                        {!userId ? (
                                            <Link href={`/auth/login?next=${encodeURIComponent(`/courses/${params.id}`)}`}>
                                                <Button className="w-full h-11 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm shadow-lg shadow-cyan-500/20">
                                                    {isFree ? t('pricing.enrollFree') : t('pricing.enrollNow')}
                                                </Button>
                                            </Link>
                                        ) : hasAccess ? (
                                            <Link href={`/dashboard/student/courses/${course.course_id}`}>
                                                <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">
                                                    {t('pricing.goToCourse')}
                                                </Button>
                                            </Link>
                                        ) : isFree ? (
                                            <Link href={`/checkout?courseId=${course.course_id}`}>
                                                <Button className="w-full h-11 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm shadow-lg shadow-cyan-500/20">
                                                    {t('pricing.enrollFree')}
                                                </Button>
                                            </Link>
                                        ) : (
                                            <Link href={`/checkout?courseId=${course.course_id}`}>
                                                <Button className="w-full h-11 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm shadow-lg shadow-cyan-500/20">
                                                    {t('pricing.buyNow')}
                                                </Button>
                                            </Link>
                                        )}

                                        {!hasAccess && !isFree && (
                                            <div className="text-center">
                                                <span className="text-zinc-400 text-xs">{t('pricing.or')}</span>
                                                <Link href="/pricing" className="block text-cyan-400 hover:underline text-sm mt-1">
                                                    {t('pricing.subscription')}
                                                </Link>
                                            </div>
                                        )}
                                    </div>

                                    {/* Includes */}
                                    <div className="space-y-4 border-t border-zinc-800 pt-6">
                                        <div className="font-bold text-sm text-white">{t('pricing.includes.title')}</div>
                                        <div className="space-y-3">
                                            {totalLessons > 0 && (
                                                <div className="flex items-center gap-3 text-sm text-zinc-200">
                                                    <BookOpen className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                                    <span>{t('pricing.includes.lessons', { count: totalLessons })}</span>
                                                </div>
                                            )}
                                            {(estimatedHours > 0 || estimatedMinutes > 0) && (
                                                <div className="flex items-center gap-3 text-sm text-zinc-200">
                                                    <Clock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                                    <span>{t('pricing.includes.duration', { h: estimatedHours, m: estimatedMinutes })}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 text-sm text-zinc-200">
                                                <Infinity className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                                <span>{t('pricing.includes.lifetime')}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-200">
                                                <Smartphone className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                                <span>{t('pricing.includes.mobile')}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-200">
                                                <Award className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                                                <span>{t('pricing.includes.certificate')}</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
