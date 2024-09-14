import dayjs from 'dayjs'

import { getScopedI18n } from '@/app/locales/server'
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
        .from('get_reviews')
        .select('*')
        .eq('entity_id', entityId)
        .eq('entity_type', entityType)

    if (error) {
        console.log(error)
        return null
    }

    const t = await getScopedI18n('ListOfReviews')

    const findCurrentUserReview = reviews.find((review) => review.profile_id === userData?.data.user.id)

    return (
        <>
            {reviews.length > 0 ? reviews.map((review) => (
                <ReviewCard
                    key={review.profile_id}
                    rating={review.rating}
                    reviewText={review.review_text}
                    reviewerName={review.full_name || 'Anonymous'}
                    reviewDate={dayjs(review.created_at).format('MMMM D, YYYY')}
                />
            )) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('noReviews')}
                </p>
            )}
            {findCurrentUserReview ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('alreadyReviewed')}
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
