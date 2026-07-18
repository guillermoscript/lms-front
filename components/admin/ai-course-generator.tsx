'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  IconCircleCheck,
  IconLoader2,
  IconPhoto,
  IconSparkles,
} from '@tabler/icons-react'
import { generateStarterCourse, type StarterCourseResult } from '@/app/actions/admin/ai-course'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const MIN_DESCRIPTION_LENGTH = 10
const MAX_DESCRIPTION_LENGTH = 500

interface AiCourseGeneratorProps {
  /** Course limit reached — mirror quick-create and disable generation. */
  disabled?: boolean
  className?: string
}

/**
 * Blank-page killer (issue #441): one sentence in, a drafted course with
 * draft lessons out. Renders alongside quick-create; the generated course is
 * opened for editing and nothing is published automatically.
 */
export function AiCourseGenerator({ disabled, className }: AiCourseGeneratorProps) {
  const t = useTranslations('dashboard.admin.products.new.ai')
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<StarterCourseResult | null>(null)

  const canGenerate =
    !disabled && !generating && description.trim().length >= MIN_DESCRIPTION_LENGTH

  const handleGenerate = async () => {
    if (!canGenerate) return
    setGenerating(true)
    try {
      const response = await generateStarterCourse(description)
      if (!response.success || !response.data) {
        toast.error(!response.success ? response.error : t('error'))
        return
      }
      setResult(response.data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setGenerating(false)
    }
  }

  if (result) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCircleCheck className="size-5 text-primary" aria-hidden="true" />
            {t('successTitle')}
          </CardTitle>
          <CardDescription>
            {t('successDescription', { count: result.lessonCount })}
          </CardDescription>
        </CardHeader>
        {result.thumbnailPrompt && (
          <CardContent>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <IconPhoto className="size-4" aria-hidden="true" />
                {t('thumbnailIdea')}
              </p>
              <p className="text-muted-foreground">{result.thumbnailPrompt}</p>
            </div>
          </CardContent>
        )}
        <CardFooter className="flex flex-wrap gap-3">
          <Link href={`/dashboard/teacher/courses/${result.courseId}`}>
            <Button>{t('openCourse')}</Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null)
              setDescription('')
            }}
          >
            {t('startOver')}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSparkles className="size-5 text-primary" aria-hidden="true" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="ai-course-description">{t('promptLabel')}</FieldLabel>
          <FieldContent>
            <Textarea
              id="ai-course-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('promptPlaceholder')}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={3}
              disabled={disabled || generating}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('draftNote')}</p>
          </FieldContent>
        </Field>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={cn(generating && 'cursor-progress')}
        >
          {generating ? (
            <>
              <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
              {t('generating')}
            </>
          ) : (
            <>
              <IconSparkles className="size-4" aria-hidden="true" />
              {t('generate')}
            </>
          )}
        </Button>
        {generating && (
          <p className="text-center text-xs text-muted-foreground" role="status">
            {t('generatingHint')}
          </p>
        )}
      </CardFooter>
    </Card>
  )
}
