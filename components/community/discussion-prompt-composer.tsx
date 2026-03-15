'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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

interface DiscussionPromptComposerProps {
  courseId: number
  lessons: { lesson_id: number; title: string }[]
  onCreated?: () => void
}

export function DiscussionPromptComposer({ courseId, lessons, onCreated }: DiscussionPromptComposerProps) {
  const t = useTranslations('community')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [lessonId, setLessonId] = useState<number | null>(null)
  const [isGraded, setIsGraded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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

      const result = await createPost(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(t('posted'))
      setTitle('')
      setContent('')
      setLessonId(null)
      setIsGraded(false)
      onCreated?.()
    } catch {
      toast.error(t('errorPosting'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <h3 className="font-semibold text-sm">{t('createPrompt')}</h3>

      <div className="space-y-2">
        <Label htmlFor="discussion-title">{t('promptTitle')}</Label>
        <input
          id="discussion-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('promptTitle')}
          className="flex h-8 w-full rounded-md border border-input bg-input/20 px-3 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="discussion-content">{t('promptContent')}</Label>
        <Textarea
          id="discussion-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('promptContent')}
          className="min-h-[100px] resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label>{t('selectLesson')}</Label>
        <Select
          value={lessonId?.toString() ?? ''}
          onValueChange={(v) => v && setLessonId(v === 'none' ? null : Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('selectLesson')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('noLesson')}</SelectItem>
            {lessons.map((lesson) => (
              <SelectItem key={lesson.lesson_id} value={lesson.lesson_id.toString()}>
                {lesson.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="graded-toggle" className="text-xs">
            {t('gradedToggle')}
          </Label>
          <p className="text-[11px] text-muted-foreground">{t('gradedToggle')}</p>
        </div>
        <Switch
          id="graded-toggle"
          checked={isGraded}
          onCheckedChange={setIsGraded}
        />
      </div>

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
