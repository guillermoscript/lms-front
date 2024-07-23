import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

import ReviewCard from '../../cards/ReviewCard'

export default async function ListOfReviews({
    entityId,
    entityType,
}: {
    entityId: number
    entityType: Tables<'reviews'>['entity_type']
}) {
    const supabase = createClient()

    const { data: reviews, error } = await supabase
        .from('reviews')
        .select('id, rating, review_text, created_at')
        .eq('entity_id', entityId)
        .eq('entity_type', entityType)

    if (error) {
        console.log(error)
        return null
    }

    if (!reviews) return null

    return (
        <>
            {reviews?.map((review) => (
                <ReviewCard
                    key={review.id}
                    rating={review.rating}
                    reviewText={review.review_text}
                    reviewerName={'John Doe'}
                    reviewDate={review.created_at}
                />
            ))}
            <ReviewCard
                rating={4}
                reviewText="The lesson was well-structured and easy to follow. The examples really helped solidify the concepts."
                reviewerName="Jane Doe"
                reviewDate="2 days ago"
            />
            <ReviewCard
                rating={3}
                reviewText="The lesson was informative, but I felt like some of the concepts could have been explained in more depth."
                reviewerName="John Smith"
                reviewDate="5 days ago"
            />
        </>
    )
}
