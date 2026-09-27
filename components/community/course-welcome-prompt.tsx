'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createPost } from '@/app/actions/community'
import { setUiState } from '@/app/actions/ui-state'
import { checklistStateKey } from '@/lib/ui-state-keys'

/** Same ceiling `createPost` enforces. */
const MAX_CONTENT_LENGTH = 5000

interface CourseWelcomePromptProps {
  courseId: number
  /** `user_ui_state` checklist id; "Not now" stores it as dismissed. */
  dismissKey: string
  defaultTitle: string
  defaultContent: string
}

/**
 * Offer to seed a freshly published course's feed with a pinned "Introduce
 * yourself" prompt (#868). The pre-filled text is shown up front, so posting it
 * as is takes one click; "Edit" opens it in fields first. The page decides when
 * it shows (published, the author, community on, feed empty, not dismissed);
 * this only writes, through `createPost`, which re-checks the pin rule on the
 * server.
 */
export function CourseWelcomePrompt({ courseId, dismissKey, defaultTitle, defaultContent }: CourseWelcomePromptProps) {
  const t = useTranslations('community.courseEntry.welcome')
  const router = useRouter()
  const headingId = useId()
  const titleId = useId()
  const contentId = useId()
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [content, setContent] = useState(defaultContent)
  const [submitting, setSubmitting] = useState(false)
  const editRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  // Closing the fields removes the focused control; hand focus back to "Edit".
  useEffect(() => {
    if (!expanded && returnFocus.current) {
      returnFocus.current = false
      editRef.current?.focus()
    }
  }, [expanded])

  if (hidden) return null

  async function handleDismiss() {
    setHidden(true)
    const result = await setUiState(checklistStateKey(dismissKey), 'dismissed')
    if (result.success) router.refresh()
  }

  function handleCancel() {
    setTitle(defaultTitle)
    setContent(defaultContent)
    returnFocus.current = true
    setExpanded(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void publish()
  }

  async function publish() {
    if (submitting || !title.trim() || !content.trim()) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('post_type', 'discussion_prompt')
      formData.append('course_id', String(courseId))
      formData.append('title', title.trim())
      formData.append('content', content.trim())
      formData.append('is_pinned', 'true')

      const result = await createPost(formData)
      if (!result.success) {
        toast.error(t('error'))
        setSubmitting(false)
        return
      }
      toast.success(t('success'))
      // Stay disabled while the feed loads, so the post cannot be sent twice.
      router.push(`/dashboard/teacher/courses/${courseId}/community`)
    } catch {
      toast.error(t('error'))
      setSubmitting(false)
    }
  }

  return (
    <Card role="region" aria-labelledby={headingId} data-testid="course-welcome-prompt" className="mb-6">
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <h2 id={headingId} className="text-sm font-medium">
            {t('title')}
          </h2>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>

        {expanded ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={titleId}>{t('titleLabel')}</Label>
              <Input
                id={titleId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={contentId}>{t('contentLabel')}</Label>
              <Textarea
                id={contentId}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={MAX_CONTENT_LENGTH}
                disabled={submitting}
                required
                className="min-h-24"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="outline" disabled={submitting || !title.trim() || !content.trim()}>
                {submitting ? t('submitting') : t('submit')}
              </Button>
              <Button type="button" variant="ghost" onClick={handleCancel} disabled={submitting}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <blockquote data-testid="course-welcome-preview" className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="font-medium">{title}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-muted-foreground">{content}</p>
            </blockquote>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void publish()} disabled={submitting}>
                {submitting ? t('submitting') : t('submit')}
              </Button>
              <Button ref={editRef} variant="ghost" onClick={() => setExpanded(true)} disabled={submitting}>
                {t('edit')}
              </Button>
              <Button variant="ghost" onClick={handleDismiss} disabled={submitting}>
                {t('dismiss')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
