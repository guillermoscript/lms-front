import { createAdminClient } from '@/lib/supabase/admin'

export interface PublicReview {
    reviewId: number
    rating: number
    reviewText: string
    createdAt: string
    reviewerName: string
}

export interface CourseSocialProof {
    averageRating: number | null
    reviewCount: number
    studentCount: number
    recentReviews: PublicReview[]
}

// Public social-proof aggregates for a course. Reviews and enrollments are
// authenticated-only under RLS, so anonymous visitors can't read them with the
// cookie client — this reads via the admin client instead. Callers MUST have
// already validated the course as tenant-scoped and published (the public
// course page does) before calling; only aggregate numbers and display fields
// (name, rating, text, date) are returned, never user ids.
export async function getCourseSocialProof(
    courseId: number,
    tenantId: string,
): Promise<CourseSocialProof> {
    const admin = createAdminClient()

    const [{ data: ratings }, { count: studentCount }] = await Promise.all([
        admin
            .from('reviews')
            .select('review_id, rating, review_text, created_at, user_id')
            .eq('entity_type', 'courses')
            .eq('entity_id', courseId)
            .order('created_at', { ascending: false }),
        admin
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', courseId)
            .eq('tenant_id', tenantId)
            .eq('status', 'active'),
    ])

    const allRatings = ratings ?? []
    const reviewCount = allRatings.length
    const averageRating = reviewCount > 0
        ? allRatings.reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : null

    const withText = allRatings
        .filter((r) => r.review_text && r.review_text.trim().length > 0)
        .slice(0, 3)

    let recentReviews: PublicReview[] = []
    if (withText.length > 0) {
        const userIds = [...new Set(withText.map((r) => r.user_id))]
        const { data: profiles } = await admin
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds)
        const nameById = new Map(
            (profiles ?? []).map((p) => [p.id, p.full_name as string | null]),
        )
        recentReviews = withText.map((r) => ({
            reviewId: r.review_id,
            rating: r.rating,
            reviewText: r.review_text as string,
            createdAt: r.created_at,
            reviewerName: nameById.get(r.user_id) || 'Student',
        }))
    }

    return {
        averageRating,
        reviewCount,
        studentCount: studentCount ?? 0,
        recentReviews,
    }
}
