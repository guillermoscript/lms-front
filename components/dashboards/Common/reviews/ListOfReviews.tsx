import dayjs from 'dayjs'

import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

import ReviewCard from '../../cards/ReviewCard'
import ReviewForm from './ReviewForm'

export default async function ListOfReviews({
    entityId,
    entityType,
}: {
    entityId: number
    entityType: Tables<'reviews'>['entity_type']
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('id, rating, review_text, created_at, user_id')
        .eq('entity_id', entityId)
        .eq('entity_type', entityType)

    if (error) {
        console.log(error)
        return null
    }

    const findCurrentUserReview = reviews.find((review) => review.user_id === userData?.data.user.id)

    return (
        <>
            {reviews.length > 0 ? reviews.map((review) => (
                <ReviewCard
                    key={review.id}
                    rating={review.rating}
                    reviewText={review.review_text}
                    reviewerName="John Doe"
                    reviewDate={dayjs(review.created_at).format('MMMM D, YYYY')}
                />
            )) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No reviews yet, be the first to review this lesson!</p>
            )}
            {findCurrentUserReview ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">You have already reviewed this lesson
                </p>
            ) : (
                <ReviewForm
                    entityId={entityId}
                    entityType={entityType}
                />
            )}
        </>
    )
}
