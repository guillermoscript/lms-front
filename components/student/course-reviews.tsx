'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { IconStar, IconStarFilled, IconUser } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'

interface Review {
  review_id: number
  rating: number
  comment: string | null
  created_at: string
  user: {
    full_name: string | null
    email: string
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

  useEffect(() => {
    loadReviews()
  }, [courseId])

  async function loadReviews() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('review_id, rating, comment, created_at, user_id')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get user details for each review
      const userIds = data?.map((r) => r.user_id) || []
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      const usersMap = new Map(users?.map((u) => [u.id, u]))

      const reviewsWithUsers =
        data?.map((r) => ({
          ...r,
          user: usersMap.get(r.user_id) || { full_name: null, email: 'Unknown' },
        })) || []

      setReviews(reviewsWithUsers as Review[])

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
      alert('Please select a rating')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('reviews').insert({
        course_id: courseId,
        user_id: userId,
        rating,
        comment: comment.trim() || null,
      })

      if (error) throw error

      setRating(0)
      setComment('')
      setUserHasReviewed(true)
      await loadReviews()
      router.refresh()
    } catch (error) {
      console.error('Error submitting review:', error)
      alert('Failed to submit review. Please try again.')
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
          <span>Course Reviews</span>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <IconStarFilled
                    key={star}
                    className={`h-4 w-4 ${
                      star <= Math.round(averageRating)
                        ? 'text-yellow-500'
                        : 'text-muted'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                {averageRating.toFixed(1)} ({reviews.length} reviews)
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
              <p className="mb-2 text-sm font-medium">Your Rating</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="transition-transform hover:scale-110"
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
              <p className="mb-2 text-sm font-medium">Your Review (Optional)</p>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience with this course..."
                rows={3}
              />
            </div>

            <Button type="submit" disabled={submitting || rating === 0}>
              {submitting ? 'Submitting...' : 'Submit Review'}
            </Button>
          </form>
        )}

        {userHasReviewed && !loading && (
          <p className="mb-6 text-sm text-muted-foreground">
            You have already reviewed this course. Thank you for your feedback!
          </p>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading reviews...</p>
          ) : reviews.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No reviews yet. Be the first to review this course!
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
                      {review.user.full_name || review.user.email}
                    </p>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <IconStarFilled
                          key={star}
                          className={`h-4 w-4 ${
                            star <= review.rating ? 'text-yellow-500' : 'text-muted'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                  {review.comment && (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{review.comment}</p>
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
