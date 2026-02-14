'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from '@/components/ui/avatar'
import { IconSend, IconMessage, IconUser } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface Comment {
  comment_id: number
  content: string
  created_at: string
  user: {
    full_name: string | null
    email: string
  }
}

interface LessonCommentsProps {
  lessonId: number
  userId: string
}

export function LessonComments({ lessonId, userId }: LessonCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('components.lessonComments')

  useEffect(() => {
    loadComments()
  }, [lessonId])

  async function loadComments() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('comment_id, content, created_at, user_id')
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get user details for each comment
      const userIds = data?.map((c) => c.user_id) || []
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      const usersMap = new Map(users?.map((u) => [u.id, u]))

      const commentsWithUsers =
        data?.map((c) => ({
          ...c,
          user: usersMap.get(c.user_id) || { full_name: null, email: t('unknown') },
        })) || []

      setComments(commentsWithUsers as Comment[])
    } catch (error) {
      console.error('Error loading comments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newComment.trim()) return

    setSubmitting(true)
    try {
      const { error } = await supabase.from('comments').insert({
        lesson_id: lessonId,
        user_id: userId,
        content: newComment.trim(),
      })

      if (error) throw error

      setNewComment('')
      await loadComments()
      router.refresh()
    } catch (error) {
      console.error('Error posting comment:', error)
      alert(t('error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconMessage className="h-5 w-5" />
          {t('title', { count: comments.length })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Comment Form */}
        <form onSubmit={handleSubmit} className="mb-6">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('placeholder')}
            rows={3}
            className="mb-3"
          />
          <Button type="submit" disabled={submitting || !newComment.trim()}>
            <IconSend className="mr-2 h-4 w-4" />
            {submitting ? t('posting') : t('post')}
          </Button>
        </form>

        {/* Comments List */}
        <div className="space-y-4">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">{t('loading')}</p>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {t('noComments')}
            </p>
          ) : (
            comments.map((comment) => (
              <div key={comment.comment_id} className="flex gap-3 rounded-lg border p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <IconUser className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="font-medium">
                      {comment.user.full_name || comment.user.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
