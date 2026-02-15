'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  IconLoader2,
  IconArrowLeft,
  IconEye,
  IconCode,
  IconDeviceFloppy,
  IconRobot,
  IconLayoutGrid,
} from '@tabler/icons-react'
import { MDXPreview } from './mdx-preview'
import { ImprovedTemplateSelector } from './improved-template-selector'
import { AIPreviewModal } from './ai-preview-modal'
import { VersionHistorySheet } from './version-history-sheet'
import { BlockEditor } from './block-editor'
import MarkdownEditor from './markdown-editor'

interface LessonEditorProps {
  courseId: number
  courseTitle: string
  initialSequence: number
  initialData?: {
    id: number
    title: string
    description: string | null
    content: string | null
    video_url: string | null
    sequence: number
    status: 'draft' | 'published' | 'archived'
    ai_task_description: string | null
    ai_task_instructions: string | null
  }
}

export function LessonEditor({
  courseId,
  courseTitle,
  initialSequence,
  initialData,
}: LessonEditorProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.lessonEditor')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    // Prefill new lessons with a tiny starter MDX to help teachers get going
    content: initialData?.content ?? (initialData ? '' : `# Nuevo tema\n\nEscribe el contenido de la lección aquí...\n\n<Callout type="info">Añade los objetivos de aprendizaje aquí</Callout>`),
    video_url: initialData?.video_url || '',
    sequence: initialData?.sequence || initialSequence,
    ai_task_description: initialData?.ai_task_description || '',
    ai_task_instructions: initialData?.ai_task_instructions || '',
  })

  const handleSave = async (publish: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const lessonData = {
        course_id: courseId,
        title: formData.title,
        description: formData.description || null,
        content: formData.content || null,
        video_url: formData.video_url || null,
        sequence: formData.sequence,
        status: publish ? ('published' as const) : ('draft' as const),
      }

      let lessonId: number | undefined = initialData?.id

      if (initialData) {
        // Update existing lesson
        const { error: updateError } = await supabase
          .from('lessons')
          .update(lessonData)
          .eq('id', initialData.id)

        if (updateError) throw updateError
      } else {
        // Create new lesson
        const { data: newLesson, error: insertError } = await supabase
          .from('lessons')
          .insert([lessonData])
          .select('id')
          .single()

        if (insertError) throw insertError
        lessonId = newLesson.id
      }

      // Handle AI Task (Fixed column names)
      if (lessonId && (formData.ai_task_description || formData.ai_task_instructions)) {
        const { error: taskError } = await supabase
          .from('lessons_ai_tasks')
          .upsert({
            lesson_id: lessonId,
            task_instructions: formData.ai_task_description || '',
            system_prompt: formData.ai_task_instructions || '',
          }, { onConflict: 'lesson_id' })

        if (taskError) throw taskError
      }

      router.push(`/dashboard/teacher/courses/${courseId}`)
    } catch (err: any) {
      console.error('Error saving lesson:', err)
      setError(err.message || 'Failed to save lesson')
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/dashboard/teacher/courses/${courseId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {t('backToCourse', { course: courseTitle })}
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {initialData ? t('editTitle') : t('createTitle')}
          </h1>
          {initialData && (
            <VersionHistorySheet
              contentType="lesson"
              contentId={initialData.id}
              currentSnapshot={formData}
              onRestore={() => router.refresh()}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column - Form */}
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">
                    {t('titleLabel')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder={t('titlePlaceholder')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('descriptionLabel')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder={t('descriptionPlaceholder')}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="video_url">{t('videoUrlLabel')}</Label>
                  <Input
                    id="video_url"
                    type="url"
                    value={formData.video_url}
                    onChange={(e) =>
                      setFormData({ ...formData, video_url: e.target.value })
                    }
                    placeholder={t('videoUrlPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('videoUrlHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sequence">
                    {t('sequenceLabel')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sequence"
                    type="number"
                    min="1"
                    value={formData.sequence}
                    onChange={(e) =>
                      setFormData({ ...formData, sequence: parseInt(e.target.value) })
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('sequenceHint')}
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t">
                <div className="flex items-center gap-2 mb-4">
                  <IconRobot className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg">{t('aiTaskTitle')}</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai_task_description">{t('aiTaskPromptLabel')}</Label>
                    <Textarea
                      id="ai_task_description"
                      value={formData.ai_task_description}
                      onChange={(e) =>
                        setFormData({ ...formData, ai_task_description: e.target.value })
                      }
                      placeholder={t('aiTaskPromptPlaceholder')}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('aiTaskPromptHint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai_task_instructions">{t('aiGradingInsLabel')}</Label>
                    <Textarea
                      id="ai_task_instructions"
                      value={formData.ai_task_instructions}
                      onChange={(e) =>
                        setFormData({ ...formData, ai_task_instructions: e.target.value })
                      }
                      placeholder={t('aiGradingInsPlaceholder')}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('aiGradingInsHint')}
                    </p>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <ImprovedTemplateSelector
                      category="lesson_task"
                      onApply={(data) => {
                        setFormData({
                          ...formData,
                          ai_task_description: data.instructions,
                          ai_task_instructions: data.system_prompt,
                        })
                      }}
                    />
                    <AIPreviewModal
                      type="lesson"
                      config={{
                        task_description: formData.ai_task_description,
                        system_prompt: formData.ai_task_instructions
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content Editor */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>{t('contentLabel')}</Label>
                  <Tabs defaultValue="visual" className="w-auto">
                    <TabsList className="h-8">
                      <TabsTrigger value="visual" className="text-xs px-3 gap-1">
                        <IconLayoutGrid className="h-3 w-3" />
                        Visual
                      </TabsTrigger>
                      <TabsTrigger value="code" className="text-xs px-3 gap-1">
                        <IconCode className="h-3 w-3" />
                        MDX
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="visual" className="mt-4">
                      <BlockEditor
                        initialContent={formData.content || ''}
                        onChange={(mdx) => setFormData({ ...formData, content: mdx })}
                      />
                    </TabsContent>
                    <TabsContent value="code" className="mt-4">
                      <MarkdownEditor
                        value={formData.content || ''}
                        onChange={(val) => setFormData({ ...formData, content: val })}
                        placeholder={t('contentPlaceholder') as string}
                        rows={20}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('contentHint')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => handleSave(false)}
              disabled={loading || !formData.title}
            >
              {loading ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconDeviceFloppy className="mr-2 h-4 w-4" />
              )}
              {t('saveDraft')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => handleSave(true)}
              disabled={loading || !formData.title}
            >
              {loading ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconEye className="mr-2 h-4 w-4" />
              )}
              {t('publishLesson')}
            </Button>
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="lg:sticky lg:top-8 lg:h-screen lg:overflow-y-auto">
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <IconEye className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">{t('previewTitle')}</h2>
              </div>

              {formData.title && (
                <h1 className="mb-4 text-2xl font-bold">{formData.title}</h1>
              )}

              {formData.description && (
                <p className="mb-6 text-muted-foreground">{formData.description}</p>
              )}

              {formData.video_url && (
                <div className="mb-6 aspect-video w-full overflow-hidden rounded-lg bg-muted">
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Video preview: {formData.video_url}
                  </p>
                </div>
              )}

              {formData.content ? (
                <MDXPreview content={formData.content} />
              ) : (
                <p className="text-center text-muted-foreground">
                  {t('previewWriting')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div >
  )
}
