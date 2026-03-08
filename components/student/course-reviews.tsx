'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { IconStar, IconStarFilled, IconUser } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

interface Review {
  review_id: number
  rating: number
  review_text: string | null
  created_at: string
  user: {
    full_name: string | null
    username: string | null
  }
}

interface CourseReviewsProps {
  courseId: number
  userId: string
  userHasReviewed: boolean
}

export function CourseReviews({
  courseId,
  userId,
  userHasReviewed: initialHasReviewed,
}: CourseReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [userHasReviewed, setUserHasReviewed] = useState(initialHasReviewed)
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('courseDetails.courseReviews')

  useEffect(() => {
    loadReviews()
  }, [courseId])

  async function loadReviews() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('review_id, rating, review_text, created_at, user_id')
        .eq('entity_type', 'courses')
        .eq('entity_id', courseId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get user details for each review
      const userIds = data?.map((r) => r.user_id) || []
      let usersMap = new Map()
      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', userIds)

        if (usersError) throw usersError
        usersMap = new Map(users?.map((u) => [u.id, u]))
      }

      const reviewsWithUsers: Review[] =
        data?.map((r) => ({
          review_id: r.review_id,
          rating: r.rating,
          review_text: r.review_text,
          created_at: r.created_at,
          user: usersMap.get(r.user_id) || { full_name: null, username: 'Unknown' },
        })) || []

      setReviews(reviewsWithUsers)

      // Check if current user has reviewed
      const hasReviewed = data?.some((r) => r.user_id === userId)
      setUserHasReviewed(hasReviewed || false)
    } catch (error) {
      console.error('Error loading reviews:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) {
      toast.error(t('selectRating'))
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('reviews').insert({
        entity_type: 'courses',
        entity_id: courseId,
        user_id: userId,
        rating,
        review_text: comment.trim() || null,
      })

      if (error) throw error

      setRating(0)
      setComment('')
      setUserHasReviewed(true)
      await loadReviews()
      router.refresh()
    } catch (error) {
      console.error('Error submitting review:', error)
      toast.error(t('errorSubmitting'))
    } finally {
      setSubmitting(false)
    }
  }

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('title')}</span>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <IconStarFilled
                    key={star}
                    className={`h-4 w-4 ${star <= Math.round(averageRating)
                      ? 'text-yellow-500'
                      : 'text-muted'
                      }`}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                {averageRating.toFixed(1)} ({t('reviewsCount', { count: reviews.length })})
              </span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Review Form */}
        {!userHasReviewed && (
          <form onSubmit={handleSubmit} className="mb-6 space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">{t('yourRating')}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="transition-transform hover:scale-110"
                    aria-label={t('starRating', { star })}
                  >
                    {star <= (hoverRating || rating) ? (
                      <IconStarFilled className="h-8 w-8 text-yellow-500" />
                    ) : (
                      <IconStar className="h-8 w-8 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t('yourReview')}</p>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('placeholder')}
                rows={3}
              />
            </div>

            <Button type="submit" disabled={submitting || rating === 0}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>
        )}

        {userHasReviewed && !loading && (
          <p className="mb-6 text-sm text-muted-foreground">
            {t('alreadyReviewed')}
          </p>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">{t('loading')}</p>
          ) : reviews.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {t('noReviews')}
            </p>
          ) : (
            reviews.map((review) => (
              <div key={review.review_id} className="flex gap-3 rounded-lg border p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <IconUser className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      {review.user.full_name || review.user.username || 'Anonymous'}
                    </p>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <IconStarFilled
                          key={star}
                          className={`h-4 w-4 ${star <= review.rating ? 'text-yellow-500' : 'text-muted'
                            }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                  {review.review_text && (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{review.review_text}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
