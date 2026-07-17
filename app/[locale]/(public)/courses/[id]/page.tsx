import { createClient } from "@/lib/supabase/server";
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
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { hasCourseAccess } from '@/lib/services/course-access'
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import { AutoFreeEnrollButton, FreeEnrollButton } from '@/components/public/free-enroll-button';
import { PlanEnrollButton } from '@/components/public/plan-enroll-button';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string; locale: string }> }): Promise<Metadata> {
    const { id, locale } = await props.params;
    const [supabase, tenantId] = await Promise.all([createClient(), getCurrentTenantId()]);
    const { data: course } = await supabase
        .from("courses")
        .select("title, description, thumbnail_url")
        .eq("course_id", parseInt(id))
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .single();
    if (!course) return {};

    const t = await getTranslations({ locale, namespace: 'seo' });
    const description = course.description
        ? course.description.replace(/\s+/g, ' ').trim().slice(0, 160)
        : t('courses.description');

    return buildPageMetadata({
        title: course.title,
        description,
        path: `/courses/${id}`,
        locale,
        image: course.thumbnail_url || undefined,
        ogBadge: t('courses.badge'),
    });
}

function formatPrice(price: number, currency: string | null): string {
    if (!currency) return `$${price}`;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(price);
    } catch {
        return `${price} ${currency.toUpperCase()}`;
    }
}

interface Lesson {
    id: number;
    title: string;
    sequence: number;
    description: string | null;
}

export default async function CourseDetailsPage(props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ enroll?: string }>;
}) {
    const [params, searchParams, t, supabase, userId, tenantId] = await Promise.all([
        props.params,
        props.searchParams,
        getTranslations('coursePublicDetails'),
        createClient(),
        getCurrentUserId(),
        getCurrentTenantId(),
    ]);
    const courseId = Number(params.id);
    // Fetch course with lessons and category
    const { data: course, error } = await supabase
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
        .eq("course_id", courseId)
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .single();

    if (error || !course) {
        notFound();
    }

    const authorPromise = course.author_id
        ? supabase
            .from("profiles")
            .select("id, full_name, avatar_url, bio")
            .eq("id", course.author_id)
            .single()
        : Promise.resolve({ data: null });

    const accessPromise = userId
        ? hasCourseAccess(supabase, userId, courseId)
        : Promise.resolve(false);

    const productCoursesPromise = supabase
        .from('product_courses')
        .select('product:products(price, currency)')
        .eq('course_id', courseId)
        .eq('tenant_id', tenantId);

    // Plan coverage — subscribers whose plan covers this course get a one-click
    // enroll instead of "Buy Now". Mirrors the browse-page semantics: a plan
    // with no plan_courses rows covers every course.
    const planCoveragePromise: Promise<boolean> = userId
        ? (async () => {
            const admin = createAdminClient()
            const { data: subs } = await admin
                .from('subscriptions')
                .select('plan_id')
                .eq('user_id', userId)
                .eq('tenant_id', tenantId)
                .eq('subscription_status', 'active')
                .limit(1)
            const planId = subs?.[0]?.plan_id
            if (!planId) return false
            const { data: planCourses } = await admin
                .from('plan_courses')
                .select('course_id')
                .eq('plan_id', planId)
            if (!planCourses || planCourses.length === 0) return true
            return planCourses.some((pc) => pc.course_id === courseId)
        })()
        : Promise.resolve(false);

    const [{ data: author }, hasAccess, { data: productCourses }, planCoversCourse] = await Promise.all([
        authorPromise,
        accessPromise,
        productCoursesPromise,
        planCoveragePromise,
    ]);

    // Sort lessons by sequence
    const lessons = course.lessons?.sort((a: Lesson, b: Lesson) => a.sequence - b.sequence) || [];
    const totalLessons = lessons.length;
    const estimatedHours = Math.floor(totalLessons * 10 / 60);
    const estimatedMinutes = (totalLessons * 10) % 60;

    type CourseProduct = { price: number | string; currency: string | null };
    const linkedProducts = (productCourses ?? [])
        .map(({ product }) => product as unknown as CourseProduct | null)
        .filter((product): product is CourseProduct => product !== null);
    // Deterministic pick: cheapest paid product (catalog cards should agree).
    const paidProducts = linkedProducts
        .filter((product) => Number(product.price) > 0)
        .sort((a, b) => Number(a.price) - Number(b.price));
    const courseProduct = paidProducts[0] ?? linkedProducts[0];
    const isFree = !courseProduct || Number(courseProduct.price) === 0;
    const priceDisplay = isFree
        ? t('pricing.free')
        : formatPrice(Number(courseProduct.price), courseProduct.currency);

    const instructor = author ? {
        name: author.full_name || t('sections.instructor.defaultName'),
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
                            <span className="text-zinc-300">{course.category.name}</span>
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
                                {course.category.name}
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
                                </div>

                                <CardContent className="p-6 space-y-6">
                                    {/* Price */}
                                    <div className="text-3xl font-bold text-white">{priceDisplay}</div>

                                    {/* CTA */}
                                    <div className="space-y-3">
                                        {!userId ? (
                                            <Link href={`/auth/login?next=${encodeURIComponent(isFree ? `/courses/${params.id}?enroll=1` : `/checkout?courseId=${course.course_id}`)}`}>
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
                                            searchParams.enroll === '1' ? (
                                                <AutoFreeEnrollButton courseId={course.course_id} />
                                            ) : (
                                                <FreeEnrollButton courseId={course.course_id} />
                                            )
                                        ) : planCoversCourse ? (
                                            <PlanEnrollButton courseId={course.course_id} />
                                        ) : (
                                            <Link href={`/checkout?courseId=${course.course_id}`}>
                                                <Button className="w-full h-11 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm shadow-lg shadow-cyan-500/20">
                                                    {t('pricing.buyNow')}
                                                </Button>
                                            </Link>
                                        )}

                                        {!hasAccess && !isFree && !planCoversCourse && (
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
