import { createClient } from "@/lib/supabase/server";
import { CourseCard } from "@/components/public/course-card";
import { Search } from "lucide-react";
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function CoursesPage() {
    const t = await getTranslations('coursesCatalog');
    const supabase = await createClient();

    // Fetch courses with category, lessons count, author, and product price
    const { data: courses } = await supabase
        .from("courses")
        .select(`
            course_id,
            title,
            description,
            thumbnail_url,
            status,
            created_at,
            published_at,
            category:course_categories (
                id,
                name
            ),
            author:profiles!courses_author_id_fkey (
                id,
                full_name,
                avatar_url
            ),
            lessons (
                id
            )
        `)
        .eq("status", "published")
        .order("created_at", { ascending: false });

    // Fetch product prices for all courses in one query
    const courseIds = courses?.map(c => c.course_id) || [];
    let productMap: Record<number, { price: number; currency: string }> = {};

    if (courseIds.length > 0) {
        const { data: productCourses } = await supabase
            .from('product_courses')
            .select('course_id, product:products(price, currency)')
            .in('course_id', courseIds);

        if (productCourses) {
            for (const pc of productCourses) {
                const product = pc.product as any;
                if (product && !productMap[pc.course_id]) {
                    productMap[pc.course_id] = {
                        price: parseFloat(product.price),
                        currency: product.currency
                    };
                }
            }
        }
    }

    // Fetch categories for filter pills
    const { data: categories } = await supabase
        .from('course_categories')
        .select('id, name')
        .order('name');

    // Enrich courses with product info
    const enrichedCourses = courses?.map(course => {
        const cat = course.category as any;
        const auth = course.author as any;
        return {
            course_id: course.course_id,
            title: course.title,
            description: course.description,
            thumbnail_url: course.thumbnail_url,
            category: cat ? (Array.isArray(cat) ? cat[0] : cat) as { id: number; name: string } : null,
            author: auth ? (Array.isArray(auth) ? auth[0] : auth) as { id: string; full_name: string; avatar_url: string | null } : null,
            lessonCount: (course.lessons as any[])?.length || 0,
            price: productMap[course.course_id]?.price ?? null,
            currency: productMap[course.course_id]?.currency ?? null,
        };
    }) || [];

    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100">
            <div className="container mx-auto py-16 px-4 md:px-8">
                {/* Header */}
                <div className="mb-12 space-y-4 max-w-2xl">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-balance">
                        {t('title')}
                    </h1>
                    <p className="text-zinc-400 text-lg leading-relaxed">
                        {t('description')}
                    </p>
                </div>

                {/* Category filter pills */}
                {categories && categories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-10" role="list" aria-label="Course categories">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                className="px-4 py-1.5 text-sm rounded-full border border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:border-zinc-500 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] transition-colors duration-150 outline-none"
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Results count */}
                <div className="mb-8 text-sm text-zinc-400">
                    {t('toolbar.showing', { count: enrichedCourses.length })}
                </div>

                {/* Courses Grid */}
                {enrichedCourses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                        {enrichedCourses.map((course) => (
                            <CourseCard key={course.course_id} course={course} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-32 bg-zinc-900/20 rounded-2xl border border-dashed border-zinc-800 flex flex-col items-center gap-6">
                        <div className="p-6 bg-zinc-800/30 rounded-full border border-zinc-700/30">
                            <Search className="w-12 h-12 text-zinc-500" aria-hidden="true" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-zinc-200 text-balance">{t('emptyState.title')}</h2>
                            <p className="text-zinc-400 text-base max-w-sm mx-auto">
                                {t('emptyState.description')}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
