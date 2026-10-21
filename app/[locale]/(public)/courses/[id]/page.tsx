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
import { CourseCover } from '@/components/public/course-cover';
import { Card, CardContent } from "@/components/ui/card";
import { getTranslations } from 'next-intl/server';
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { hasCourseAccess } from '@/lib/services/course-access'
import type { Metadata } from 'next';
import { buildPageMetadata, getSeoContext } from '@/lib/seo';
import { pickCourseProduct } from '@/lib/course-pricing';
import { JsonLd, courseJsonLd } from '@/lib/structured-data';
import { AutoFreeEnrollButton, FreeEnrollButton } from '@/components/public/free-enroll-button';
import { PlanEnrollButton } from '@/components/public/plan-enroll-button';
import { AlreadyHaveAccountLink } from '@/components/public/already-have-account-link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCourseSocialProof } from '@/lib/social-proof';
import { StarRating } from '@/components/shared/star-rating';
import { Users } from 'lucide-react';
import { isFreePreviewEnabled } from '@/lib/settings/free-preview';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ id: string; locale: string }> }): Promise<Metadata> {
    const { id, locale } = await props.params;
    const [supabase, tenantId] = await Promise.all([createClient(), getCurrentTenantId()]);
    const { data: course } = await supabase
        .from("courses")
        .select("title, description")
        .eq("course_id", parseInt(id))
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .single();
    if (!course) return {};

    const t = await getTranslations({ locale, namespace: 'seo' });
    const description = course.description
        ? course.description.replace(/\s+/g, ' ').trim().slice(0, 160)
        : t('courses.description');

    // The branded course card (issue #765) always wins over the raw thumbnail:
    // it carries the school's logo/brand/heading font, and falls back to a
    // brand-only card when the course has no thumbnail.
    return buildPageMetadata({
        title: course.title,
        description,
        path: `/courses/${id}`,
        locale,
        ogParams: { type: 'course', courseId: id },
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
    summary: string | null;
    image: string | null;
    video_url: string | null;
    is_preview: boolean;
}

export default async function CourseDetailsPage(props: {
    params: Promise<{ id: string; locale: string }>;
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

    // Curriculum via admin client: the anon role can only read preview lessons
    // (RLS), but the public page lists every published lesson's title. Metadata
    // only — never select content here.
    const lessonsPromise = createAdminClient()
        .from('lessons')
        .select('id, title, sequence, description, summary, image, video_url, is_preview')
        .eq('course_id', courseId)
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .order('sequence', { ascending: true });

    // Per-lesson exercises / resources and the course's exams, only to count and
    // label them on the curriculum. Same admin-client rationale as the lessons.
    const admin = createAdminClient();
    const exercisesPromise = admin
        .from('exercises')
        .select('id, lesson_id')
        .eq('course_id', courseId)
        .eq('tenant_id', tenantId)
        .eq('status', 'published');
    const examsPromise = admin
        .from('exams')
        .select('exam_id, title, duration')
        .eq('course_id', courseId)
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .order('sequence', { ascending: true });
    const resourcesPromise = lessonsPromise.then(({ data }) => {
        const ids = (data ?? []).map((l) => l.id);
        if (ids.length === 0) return { data: [] as { lesson_id: number }[] };
        return admin
            .from('lesson_resources')
            .select('lesson_id')
            .in('lesson_id', ids)
            .eq('tenant_id', tenantId);
    });

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

    const [{ data: author }, hasAccess, { data: productCourses }, planCoversCourse, socialProof, { data: lessonRows }, seo, freePreviewEnabled, { data: exerciseRows }, { data: examRows }, { data: resourceRows }] = await Promise.all([
        authorPromise,
        accessPromise,
        productCoursesPromise,
        planCoveragePromise,
        getCourseSocialProof(courseId, tenantId),
        lessonsPromise,
        getSeoContext(),
        isFreePreviewEnabled(tenantId),
        exercisesPromise,
        examsPromise,
        resourcesPromise,
    ]);

    const { averageRating, reviewCount, studentCount, recentReviews } = socialProof;

    const lessons: Lesson[] = lessonRows ?? [];
    const totalLessons = lessons.length;
    // Duration comes only from the teacher-set estimate; hidden when unset (#425)
    const durationMinutes: number = course.estimated_duration_minutes ?? 0;
    const hasDuration = durationMinutes > 0;
    const estimatedHours = Math.floor(durationMinutes / 60);
    const estimatedMinutes = durationMinutes % 60;

    type CourseProduct = { price: number | string; currency: string | null };
    const courseProduct = pickCourseProduct(
        (productCourses ?? []).map(({ product }) => product as unknown as CourseProduct | null)
    );
    const isFree = !courseProduct || Number(courseProduct.price) === 0;
    const priceDisplay = isFree
        ? t('pricing.free')
        : formatPrice(Number(courseProduct.price), courseProduct.currency);

    // Where an anonymous visitor lands once they have an account. Unchanged
    // from when the CTA pointed at login: the free path re-enters this page
    // with `enroll=1` so `AutoFreeEnrollButton` finishes the job, the paid one
    // goes straight to checkout.
    const anonymousNext = isFree
        ? `/courses/${params.id}?enroll=1`
        : `/checkout?courseId=${course.course_id}`;

    // Real data only (#730): an author without a full name falls back to the
    // school's own name (never an invented "Instructor"), and a missing bio
    // just hides the bio line instead of inventing one.
    const instructor = author ? {
        name: author.full_name || seo.siteName,
        avatar_url: author.avatar_url,
        bio: author.bio?.trim() || null,
    } : null;

    // Teacher-authored objectives only — never derived from lesson content;
    // an empty list hides the section entirely (#425)
    const whatYoullLearn: string[] = (course.learning_objectives ?? []).filter(
        (objective: string) => typeof objective === 'string' && objective.trim().length > 0
    );

    const formattedDate = course.published_at
        ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(course.published_at))
        : null;

    // schema.org Course rich-result markup. Offer mirrors the deterministic
    // product pick above so the structured price always matches the page.
    const courseUrl = `${seo.baseUrl}/${params.locale}/courses/${course.course_id}`;
    const structuredData = courseJsonLd({
        name: course.title,
        description: course.description,
        url: courseUrl,
        image: course.thumbnail_url,
        providerName: seo.siteName,
        providerUrl: seo.baseUrl,
        datePublished: course.published_at,
        price: !isFree && courseProduct ? Number(courseProduct.price) : null,
        currency: !isFree && courseProduct ? courseProduct.currency : null,
        isFree,
        averageRating,
        reviewCount,
        learningObjectives: whatYoullLearn,
        durationMinutes: hasDuration ? durationMinutes : null,
    });

    const metaItems = [
        studentCount > 0 && { key: 'students', icon: Users, label: t('socialProof.students', { count: studentCount }) },
        totalLessons > 0 && { key: 'lessons', icon: BookOpen, label: t('hero.lessons', { count: totalLessons }) },
        hasDuration && { key: 'duration', icon: Clock, label: t('hero.duration', { h: estimatedHours, m: estimatedMinutes }) },
        formattedDate && { key: 'published', icon: Calendar, label: t('hero.published', { date: formattedDate }) },
    ].filter(Boolean) as { key: string; icon: typeof Users; label: string }[];

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <JsonLd data={structuredData} />
            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="border-b border-border">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Link href="/" className="hover:text-brand-text transition-colors duration-150">{t('breadcrumbs.home')}</Link>
                    <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <Link href="/courses" className="hover:text-brand-text transition-colors duration-150">{t('breadcrumbs.courses')}</Link>
                    {course.category && (
                        <>
                            <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span className="text-foreground">{course.category.name}</span>
                        </>
                    )}
                    <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="text-brand-text truncate max-w-[200px]" aria-current="page">{course.title}</span>
                </div>
            </nav>

            {/* One grid for hero + body so the enroll card can start beside the
                title and stay sticky all the way down the curriculum. The hero
                band is the `shadow`/`clip-path` bleed on the first cell. */}
            <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-12">
                {/* Hero */}
                <header className="lg:col-start-1 lg:row-start-1 py-10 lg:py-14 bg-muted shadow-[0_0_0_100vmax_var(--muted)] [clip-path:inset(0_-100vmax)]">
                    {course.category && (
                        <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-brand-tint text-brand-text border border-primary/25 mb-4">
                            {course.category.name}
                        </span>
                    )}

                    <h1 className="text-3xl lg:text-5xl font-bold mb-5 tracking-tight leading-tight text-foreground text-balance">
                        {course.title}
                    </h1>

                    {course.description && (
                        <div className="mb-6 max-w-2xl">
                            <p className="text-lg text-foreground/80 leading-relaxed text-pretty line-clamp-3">
                                {course.description}
                            </p>
                            {course.description.length > 220 && (
                                <a href="#about" className="mt-1 inline-block text-sm font-medium text-brand-text hover:underline">
                                    {t('hero.readMore')}
                                </a>
                            )}
                        </div>
                    )}

                    {averageRating !== null && (
                        <div className="flex items-center gap-1.5 text-sm mb-4">
                            <span className="font-bold text-warning">{averageRating.toFixed(1)}</span>
                            <StarRating rating={averageRating} />
                            <span className="text-muted-foreground">{t('socialProof.reviewCount', { count: reviewCount })}</span>
                        </div>
                    )}

                    {metaItems.length > 0 && (
                        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground/80">
                            {metaItems.map(({ key, icon: Icon, label }) => (
                                <li key={key} className="flex items-center gap-1.5">
                                    <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                    <span>{label}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {instructor && (
                        <div className="mt-6 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-background overflow-hidden ring-1 ring-border">
                                {instructor.avatar_url ? (
                                    <img src={instructor.avatar_url} alt={instructor.name} width={36} height={36} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <User className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                    </div>
                                )}
                            </div>
                            <span className="text-sm text-foreground">{t('hero.createdBy', { name: instructor.name })}</span>
                        </div>
                    )}
                </header>

                {/* Enroll card: after the hero on mobile, right column on desktop */}
                <aside className="mt-8 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:pt-10">
                    <div className="lg:sticky lg:top-6">
                        <Card className="shadow-xl overflow-hidden">
                            <CourseCover
                                title={course.title}
                                thumbnailUrl={course.thumbnail_url}
                                category={course.category?.name}
                            />

                            <CardContent className="p-6 space-y-5">
                                <div className="text-3xl font-bold">{priceDisplay}</div>

                                {/* CTA */}
                                <div className="space-y-3">
                                    {!userId ? (
                                        <div className="space-y-2">
                                            {/* A visitor who arrived by a shared link most likely has no
                                                account yet, so the button goes to sign-up; the login link
                                                below carries the same `next` for the ones who do (#685). */}
                                            <Link href={`/auth/sign-up?next=${encodeURIComponent(anonymousNext)}`}>
                                                <Button data-testid="course-enroll-cta" className="w-full h-11 font-bold text-sm shadow-lg shadow-primary/20">
                                                    {isFree ? t('pricing.enrollFree') : t('pricing.enrollNow')}
                                                </Button>
                                            </Link>
                                            <AlreadyHaveAccountLink
                                                next={anonymousNext}
                                                testId="course-enroll-login"
                                                linkClassName="text-brand-text"
                                            />
                                        </div>
                                    ) : hasAccess ? (
                                        <Link href={`/dashboard/student/courses/${course.course_id}`}>
                                            <Button data-testid="course-go-to-course" className="w-full h-11 bg-success hover:bg-success/90 text-success-foreground font-bold text-sm">
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
                                            <Button className="w-full h-11 font-bold text-sm shadow-lg shadow-primary/20">
                                                {t('pricing.buyNow')}
                                            </Button>
                                        </Link>
                                    )}

                                    {!hasAccess && !isFree && !planCoversCourse && (
                                        <div className="text-center">
                                            <span className="text-muted-foreground text-xs">{t('pricing.or')}</span>
                                            <Link href="/pricing" className="block text-brand-text hover:underline text-sm mt-1">
                                                {t('pricing.subscription')}
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                {/* Includes */}
                                <div className="space-y-3 border-t border-border pt-5">
                                    <div className="font-bold text-sm">{t('pricing.includes.title')}</div>
                                    <ul className="space-y-2.5 text-sm text-foreground">
                                        {totalLessons > 0 && (
                                            <li className="flex items-center gap-3">
                                                <BookOpen className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                <span>{t('pricing.includes.lessons', { count: totalLessons })}</span>
                                            </li>
                                        )}
                                        {hasDuration && (
                                            <li className="flex items-center gap-3">
                                                <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                <span>{t('pricing.includes.duration', { h: estimatedHours, m: estimatedMinutes })}</span>
                                            </li>
                                        )}
                                        <li className="flex items-center gap-3">
                                            <Infinity className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            <span>{t('pricing.includes.lifetime')}</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <Smartphone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            <span>{t('pricing.includes.mobile')}</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <Award className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                            <span>{t('pricing.includes.certificate')}</span>
                                        </li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </aside>

                {/* Body */}
                <div className="lg:col-start-1 lg:row-start-2 py-12 space-y-14 min-w-0">
                    {/* What you'll learn */}
                    {whatYoullLearn.length > 0 && (
                        <section className="bg-card border border-border rounded-xl p-6 md:p-8">
                            <h2 className="text-2xl font-bold mb-6 text-foreground text-balance">{t('sections.whatYoullLearn')}</h2>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                {whatYoullLearn.map((item: string, i: number) => (
                                    <li key={i} className="flex gap-3">
                                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-brand-text" aria-hidden="true" />
                                        <span className="text-foreground text-sm leading-relaxed">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* About: the full text the hero only teases */}
                    {course.description && (
                        <section id="about" className="scroll-mt-6">
                            <h2 className="text-2xl font-bold mb-4 text-foreground">{t('sections.about')}</h2>
                            <p className="max-w-[65ch] text-base leading-7 text-foreground whitespace-pre-line">
                                {course.description}
                            </p>
                        </section>
                    )}

                    {/* Course Content: always open, so the curriculum is the first thing a visitor can scan */}
                    <section>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 mb-4">
                            <h2 className="text-2xl font-bold text-foreground">{t('sections.content.title')}</h2>
                            <p className="text-sm text-muted-foreground">
                                {t('sections.content.lectures', { count: lessons.length })}
                                {hasDuration && <> &middot; {t('sections.content.totalLength', { h: estimatedHours, m: estimatedMinutes })}</>}
                            </p>
                        </div>

                        {lessons.length > 0 ? (
                            <ol className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                                {lessons.map((lesson: Lesson, index: number) => {
                                    // The school-level switch (#799) wins over the per-lesson
                                    // flag: this page is read via the admin client (bypasses
                                    // RLS), so it must not keep badging/linking to a preview
                                    // lesson the school just turned off tenant-wide.
                                    const isPreview = lesson.is_preview && freePreviewEnabled;
                                    const row = (
                                        <>
                                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${isPreview ? 'bg-brand-tint text-brand-text' : 'bg-muted text-muted-foreground'}`}>
                                                {isPreview ? <PlayCircle className="h-4 w-4" aria-hidden="true" /> : index + 1}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-sm font-medium text-foreground truncate ${isPreview ? 'group-hover:text-brand-text transition-colors duration-150' : ''}`}>
                                                    {lesson.title}
                                                </div>
                                                {lesson.description && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{lesson.description}</p>
                                                )}
                                            </div>
                                            {isPreview && (
                                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-text border border-primary/25 bg-brand-tint rounded-full px-2 py-0.5">
                                                    {t('sections.content.previewBadge')}
                                                </span>
                                            )}
                                        </>
                                    );
                                    return (
                                        <li key={lesson.id}>
                                            {isPreview ? (
                                                <Link
                                                    href={`/courses/${params.id}/lessons/${lesson.id}`}
                                                    className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors duration-150"
                                                >
                                                    {row}
                                                </Link>
                                            ) : (
                                                <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground rounded-xl border border-dashed border-border">
                                {t('sections.content.noLessons')}
                            </div>
                        )}
                    </section>

                    {/* What students say */}
                    {recentReviews.length > 0 && (
                        <section>
                            <h2 className="text-2xl font-bold mb-2 text-foreground">{t('socialProof.title')}</h2>
                            {averageRating !== null && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                                    <span className="font-bold text-warning">{averageRating.toFixed(1)}</span>
                                    <StarRating rating={averageRating} />
                                    <span className="text-muted-foreground">{t('socialProof.reviewCount', { count: reviewCount })}</span>
                                </div>
                            )}
                            <div className="space-y-4">
                                {recentReviews.map((review) => (
                                    <div key={review.reviewId} className="bg-card border border-border rounded-xl p-6">
                                        <div className="flex flex-wrap items-center gap-3 mb-3">
                                            <span className="font-bold text-foreground text-sm">{review.reviewerName}</span>
                                            <StarRating rating={review.rating} starClassName="w-3.5 h-3.5" />
                                            <span className="text-xs text-muted-foreground">
                                                {new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(review.createdAt))}
                                            </span>
                                        </div>
                                        <p className="text-sm text-foreground leading-relaxed">{review.reviewText}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Instructor */}
                    {instructor && (
                        <section>
                            <h2 className="text-2xl font-bold mb-4 text-foreground">{t('sections.instructor.title')}</h2>
                            <div className="flex items-start gap-5 bg-card border border-border rounded-xl p-6">
                                <div className="w-16 h-16 rounded-full bg-muted overflow-hidden shrink-0 ring-2 ring-border">
                                    {instructor.avatar_url ? (
                                        <img src={instructor.avatar_url} alt={instructor.name} width={64} height={64} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-lg font-bold text-foreground">{instructor.name}</div>
                                    {instructor.bio && (
                                        <p className="text-muted-foreground leading-relaxed mt-2 text-sm max-w-[65ch]">
                                            {instructor.bio}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
