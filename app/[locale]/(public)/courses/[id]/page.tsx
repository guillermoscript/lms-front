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
        .select('id, title, sequence, description, is_preview')
        .eq('course_id', courseId)
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .order('sequence', { ascending: true });

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

    const [{ data: author }, hasAccess, { data: productCourses }, planCoversCourse, socialProof, { data: lessonRows }, seo] = await Promise.all([
        authorPromise,
        accessPromise,
        productCoursesPromise,
        planCoveragePromise,
        getCourseSocialProof(courseId, tenantId),
        lessonsPromise,
        getSeoContext(),
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

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <JsonLd data={structuredData} />
            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="bg-muted/50 border-b border-border">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Link href="/" className="hover:text-brand-text transition-colors duration-150">{t('breadcrumbs.home')}</Link>
                    <ChevronRight className="w-3 h-3" aria-hidden="true" />
                    <Link href="/courses" className="hover:text-brand-text transition-colors duration-150">{t('breadcrumbs.courses')}</Link>
                    {course.category && (
                        <>
                            <ChevronRight className="w-3 h-3" aria-hidden="true" />
                            <span className="text-foreground">{course.category.name}</span>
                        </>
                    )}
                    <ChevronRight className="w-3 h-3" aria-hidden="true" />
                    <span className="text-brand-text truncate max-w-[200px]" aria-current="page">{course.title}</span>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="bg-muted border-b border-border py-12 lg:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl">
                        {course.category && (
                            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-brand-tint text-brand-text border border-primary/25 mb-4">
                                {course.category.name}
                            </span>
                        )}

                        <h1 className="text-3xl lg:text-5xl font-bold mb-4 tracking-tight leading-tight text-foreground text-balance">
                            {course.title}
                        </h1>

                        {course.description && (
                            <p className="text-lg text-foreground/80 mb-8 leading-relaxed max-w-3xl text-pretty">
                                {course.description}
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-6 text-sm text-foreground/80">
                            {averageRating !== null && (
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-warning">{averageRating.toFixed(1)}</span>
                                    <StarRating rating={averageRating} />
                                    <span className="text-muted-foreground">{t('socialProof.reviewCount', { count: reviewCount })}</span>
                                </div>
                            )}
                            {studentCount > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                    <span>{t('socialProof.students', { count: studentCount })}</span>
                                </div>
                            )}
                            {totalLessons > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <BookOpen className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                    <span>{t('hero.lessons', { count: totalLessons })}</span>
                                </div>
                            )}
                            {hasDuration && (
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                    <span>{t('hero.duration', { h: estimatedHours, m: estimatedMinutes })}</span>
                                </div>
                            )}
                            {formattedDate && (
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                    <span>{t('hero.published', { date: formattedDate })}</span>
                                </div>
                            )}
                        </div>

                        {instructor && (
                            <div className="mt-8 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-background overflow-hidden">
                                    {instructor.avatar_url ? (
                                        <img src={instructor.avatar_url} alt={instructor.name} width={40} height={40} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                                        </div>
                                    )}
                                </div>
                                <span className="text-foreground">{t('hero.createdBy', { name: instructor.name })}</span>
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
                            <section className="bg-card border border-border rounded-xl p-8">
                                <h2 className="text-2xl font-bold mb-6 text-foreground text-balance">{t('sections.whatYoullLearn')}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                    {whatYoullLearn.map((item: string, i: number) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="mt-0.5 flex-shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-brand-text" aria-hidden="true" />
                                            </div>
                                            <span className="text-foreground text-sm leading-relaxed">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Course Content */}
                        <section>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-foreground">{t('sections.content.title')}</h2>
                            </div>
                            <div className="text-sm text-muted-foreground mb-4 flex gap-3">
                                <span>{t('sections.content.lectures', { count: lessons.length })}</span>
                                {hasDuration && (
                                    <>
                                        <span aria-hidden="true">&middot;</span>
                                        <span>{t('sections.content.totalLength', { h: estimatedHours, m: estimatedMinutes })}</span>
                                    </>
                                )}
                            </div>

                            {lessons.length > 0 ? (
                                <Accordion className="w-full space-y-3">
                                    <AccordionItem value="lessons" className="border border-border bg-card rounded-lg px-4 overflow-hidden">
                                        <AccordionTrigger className="hover:no-underline py-4">
                                            <div className="flex items-center gap-4 text-left">
                                                <span className="font-bold text-foreground">{t('sections.content.allLessons')}</span>
                                                <span className="text-xs text-muted-foreground font-normal">{t('sections.content.lectures', { count: lessons.length })}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pb-4 space-y-1">
                                            {lessons.map((lesson: Lesson, index: number) => (
                                                lesson.is_preview ? (
                                                    <Link
                                                        key={lesson.id}
                                                        href={`/courses/${params.id}/lessons/${lesson.id}`}
                                                        className="flex items-center justify-between gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors duration-150 group"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="text-xs text-muted-foreground font-mono w-6 text-right tabular-nums flex-shrink-0">{index + 1}</span>
                                                            <PlayCircle className="w-4 h-4 text-brand-text flex-shrink-0" aria-hidden="true" />
                                                            <span className="text-sm text-foreground truncate group-hover:text-brand-text transition-colors duration-150">{lesson.title}</span>
                                                        </div>
                                                        <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-text border border-primary/25 bg-brand-tint rounded-full px-2 py-0.5">
                                                            {t('sections.content.previewBadge')}
                                                        </span>
                                                    </Link>
                                                ) : (
                                                    <div key={lesson.id} className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors duration-150">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="text-xs text-muted-foreground font-mono w-6 text-right tabular-nums flex-shrink-0">{index + 1}</span>
                                                            <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                                                            <span className="text-sm text-foreground truncate">{lesson.title}</span>
                                                        </div>
                                                    </div>
                                                )
                                            ))}
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
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

                        {/* About */}
                        {course.description && (
                            <section className="space-y-6">
                                <h2 className="text-2xl font-bold text-foreground">{t('sections.about')}</h2>
                                <div className="text-foreground text-base leading-relaxed whitespace-pre-line">
                                    {course.description}
                                </div>
                            </section>
                        )}

                        {/* Instructor */}
                        {instructor && (
                            <section>
                                <h2 className="text-2xl font-bold mb-8 text-foreground">{t('sections.instructor.title')}</h2>
                                <div className="flex items-start gap-5 bg-card border border-border rounded-xl p-6">
                                    <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex-shrink-0 ring-2 ring-border">
                                        {instructor.avatar_url ? (
                                            <img src={instructor.avatar_url} alt={instructor.name} width={80} height={80} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <User className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-lg font-bold text-foreground">{instructor.name}</div>
                                        {instructor.bio && (
                                            <p className="text-muted-foreground leading-relaxed mt-3 text-sm">
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
                            <Card className="shadow-2xl overflow-hidden">
                                {/* Thumbnail */}
                                <div className="relative aspect-video">
                                    {course.thumbnail_url ? (
                                        <img
                                            src={course.thumbnail_url}
                                            alt={course.title}
                                            width={400}
                                            height={225}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-muted flex items-center justify-center">
                                            <PlayCircle className="w-16 h-16 text-muted-foreground" aria-hidden="true" />
                                        </div>
                                    )}
                                </div>

                                <CardContent className="p-6 space-y-6">
                                    {/* Price */}
                                    <div className="text-3xl font-bold">{priceDisplay}</div>

                                    {/* Social proof */}
                                    {(averageRating !== null || studentCount > 0) && (
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                            {averageRating !== null && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-warning">{averageRating.toFixed(1)}</span>
                                                    <StarRating rating={averageRating} starClassName="w-3.5 h-3.5" />
                                                    <span className="text-muted-foreground text-xs">{t('socialProof.reviewCount', { count: reviewCount })}</span>
                                                </div>
                                            )}
                                            {studentCount > 0 && (
                                                <div className="flex items-center gap-1.5">
                                                    <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                    <span className="text-xs">{t('socialProof.students', { count: studentCount })}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

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
                                    <div className="space-y-4 border-t border-border pt-6">
                                        <div className="font-bold text-sm">{t('pricing.includes.title')}</div>
                                        <div className="space-y-3">
                                            {totalLessons > 0 && (
                                                <div className="flex items-center gap-3 text-sm text-foreground">
                                                    <BookOpen className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                    <span>{t('pricing.includes.lessons', { count: totalLessons })}</span>
                                                </div>
                                            )}
                                            {hasDuration && (
                                                <div className="flex items-center gap-3 text-sm text-foreground">
                                                    <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                    <span>{t('pricing.includes.duration', { h: estimatedHours, m: estimatedMinutes })}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 text-sm text-foreground">
                                                <Infinity className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                <span>{t('pricing.includes.lifetime')}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-foreground">
                                                <Smartphone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                                                <span>{t('pricing.includes.mobile')}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-foreground">
                                                <Award className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
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
