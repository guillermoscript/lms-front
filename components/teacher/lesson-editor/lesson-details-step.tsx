'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  IconFileText,
  IconVideo,
  IconChevronRight,
  IconCalendarEvent,
} from '@tabler/icons-react'
import { useLessonEditor } from './lesson-editor-context'

export function LessonDetailsStep() {
  const { formData, updateField, initialData, setActiveStep } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  return (
    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
      {/* Title - large, prominent input */}
      <div className="mb-8">
        <input
          type="text"
          value={formData.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder={t('titlePlaceholder')}
          className="w-full border-0 bg-transparent text-3xl font-bold tracking-tight placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0"
          autoFocus
        />
        <div className="mt-1 h-px bg-border" />
      </div>

      {/* Description */}
      <div className="mb-6">
        <Label
          htmlFor="description"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <IconFileText className="h-3.5 w-3.5" />
          {t('descriptionLabel')}
        </Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder={t('descriptionPlaceholder')}
          rows={3}
          className="resize-none border-muted bg-muted/30 transition-colors focus:bg-background"
        />
      </div>

      {/* Video URL */}
      <div className="mb-6">
        <Label
          htmlFor="video_url"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <IconVideo className="h-3.5 w-3.5" />
          {t('videoUrlLabel')}
        </Label>
        <Input
          id="video_url"
          type="url"
          value={formData.video_url}
          onChange={(e) => updateField('video_url', e.target.value)}
          placeholder={t('videoUrlPlaceholder')}
          className="border-muted bg-muted/30 transition-colors focus:bg-background"
        />
        <p className="mt-1.5 text-xs text-muted-foreground/70">
          {t('videoUrlHint')}
        </p>

        {/* Video embed preview */}
        {formData.video_url && formData.video_url.includes('youtube') && (
          <div className="mt-3 overflow-hidden rounded-lg border bg-muted/30">
            <div className="aspect-video">
              <iframe
                src={formData.video_url
                  .replace('watch?v=', 'embed/')
                  .replace('youtu.be/', 'youtube.com/embed/')}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                allowFullScreen
              />
            </div>
          </div>
        )}
      </div>

      {/* Lesson order */}
      <div className="mb-8">
        <Label
          htmlFor="sequence"
          className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          {t('sequenceLabel')}
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="sequence"
            type="number"
            min="1"
            value={formData.sequence}
            onChange={(e) =>
              updateField('sequence', parseInt(e.target.value) || 1)
            }
            className="w-20 border-muted bg-muted/30 text-center transition-colors focus:bg-background"
          />
          <p className="text-xs text-muted-foreground/70">
            {t('sequenceHint')}
          </p>
        </div>
      </div>

      {/* Publish scheduling */}
      {(!initialData || initialData.status === 'draft') && (
        <div className="mb-8">
          <Label
            htmlFor="publish_at"
            className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <IconCalendarEvent className="h-3.5 w-3.5" />
            {t('publishAt')}
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="publish_at"
              type="datetime-local"
              value={formData.publish_at}
              onChange={(e) => updateField('publish_at', e.target.value)}
              className="w-auto border-muted bg-muted/30 transition-colors focus:bg-background"
            />
            {formData.publish_at && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => updateField('publish_at', '')}
              >
                {t('clearSchedule')}
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground/70">
            {t('publishAtHint')}
          </p>
        </div>
      )}

      {/* Next step prompt */}
      <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          {formData.title
            ? t('readyForContent')
            : t('enterTitleFirst')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveStep('content')}
          disabled={!formData.title}
          className="gap-2"
        >
          {t('writeContent')}
          <IconChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
