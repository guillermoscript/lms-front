'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CommunityMarkdownField } from './community-markdown'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { createPost } from '@/app/actions/community'
import { cn } from '@/lib/utils'
import { endOfLocalDayIso } from '@/lib/community/prompt-grades'

/** The select's value for "not linked to a lesson" — base-ui needs a string. */
const NO_LESSON = 'none'

interface DiscussionPromptComposerProps {
  courseId: number
  /** `id` is the lessons PK. */
  lessons: { id: number; title: string }[]
  /** Pre-selects a lesson (the lesson list's "Add discussion prompt", #869). */
  defaultLessonId?: number | null
  onCreated?: (postId: string) => void
  /** Hide the form's own heading when a sheet or dialog already titles it. */
  heading?: boolean
  className?: string
}

export function DiscussionPromptComposer({
  courseId,
  lessons,
  defaultLessonId = null,
  onCreated,
  heading = true,
  className,
}: DiscussionPromptComposerProps) {
  const t = useTranslations('community')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // null = nothing picked yet, NO_LESSON = picked "No lesson", else a lesson id.
  const [lessonValue, setLessonValue] = useState<string | null>(
    defaultLessonId ? String(defaultLessonId) : null
  )
  const [isGraded, setIsGraded] = useState(false)
  // `YYYY-MM-DD` from the date input; sent as the end of that local day (#873).
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fieldId = useId()

  const titleById = new Map(lessons.map((l) => [l.id, l.title]))
  const lessonId = lessonValue && lessonValue !== NO_LESSON ? Number(lessonValue) : null

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('content', content.trim())
      formData.append('title', title.trim())
      formData.append('post_type', 'discussion_prompt')
      formData.append('course_id', String(courseId))
      if (lessonId) formData.append('lesson_id', String(lessonId))
      formData.append('is_graded', String(isGraded))
      const dueAt = isGraded && dueDate ? endOfLocalDayIso(dueDate) : null
      if (dueAt) formData.append('due_at', dueAt)

      const result = await createPost(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setTitle('')
      setContent('')
      setLessonValue(defaultLessonId ? String(defaultLessonId) : null)
      setIsGraded(false)
      setDueDate('')
      if (onCreated && result.data?.id) {
        onCreated(result.data.id)
      } else {
        toast.success(t('posted'))
      }
    } catch {
      toast.error(t('errorPosting'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cn('rounded-xl border bg-card p-4 space-y-4', className)}>
      {heading && <h3 className="font-semibold text-sm">{t('createPrompt')}</h3>}

      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-title`}>{t('promptTitle')}</Label>
        <input
          id={`${fieldId}-title`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('promptTitle')}
          maxLength={200}
          className="flex h-8 w-full rounded-md border border-input bg-input/20 px-3 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-content`}>{t('promptContent')}</Label>
        <CommunityMarkdownField value={content}>
          <Textarea
            id={`${fieldId}-content`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('promptContent')}
            maxLength={5000}
            className="min-h-[100px] resize-y"
          />
        </CommunityMarkdownField>
      </div>

      <div className="space-y-2">
        <Label id={`${fieldId}-lesson-label`}>{t('selectLesson')}</Label>
        <Select value={lessonValue} onValueChange={(v) => v && setLessonValue(v)}>
          <SelectTrigger className="w-full" aria-labelledby={`${fieldId}-lesson-label`}>
            {/* base-ui shows the raw value (a lesson id) unless told how to label it. */}
            <SelectValue>
              {(v: string | null) =>
                v == null || v === ''
                  ? t('selectLesson')
                  : v === NO_LESSON
                    ? t('noLesson')
                    : (titleById.get(Number(v)) ?? v)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_LESSON}>{t('noLesson')}</SelectItem>
            {lessons.map((lesson) => (
              <SelectItem key={lesson.id} value={String(lesson.id)}>
                {lesson.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={`${fieldId}-graded`} className="text-xs">
            {t('gradedToggle')}
          </Label>
          <p className="text-[11px] text-muted-foreground">{t('lessonDiscussion.gradedHint')}</p>
        </div>
        <Switch id={`${fieldId}-graded`} checked={isGraded} onCheckedChange={setIsGraded} />
      </div>

      {isGraded && (
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-due`} className="text-xs">
            {t('promptGrade.dueDate')}
          </Label>
          <input
            id={`${fieldId}-due`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-describedby={`${fieldId}-due-hint`}
            className="flex h-8 w-full max-w-48 rounded-md border border-input bg-input/20 px-3 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
          />
          <p id={`${fieldId}-due-hint`} className="text-[11px] text-muted-foreground">
            {t('promptGrade.dueDateHint')}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !content.trim()}
        >
          {submitting ? t('posting') : t('createPrompt')}
        </Button>
      </div>
    </div>
  )
}
