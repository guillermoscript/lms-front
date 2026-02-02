'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
} from '@tabler/icons-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PromptTemplateSelector } from './prompt-template-selector'
import { AIPreviewModal } from './ai-preview-modal'

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
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    content: initialData?.content || '',
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
            task_instructions: formData.ai_task_description || '', // Fixed: was task_description
            system_prompt: formData.ai_task_instructions || '', // Fixed: was ai_instructions
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
            Back to {courseTitle}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">
          {initialData ? 'Edit Lesson' : 'Create New Lesson'}
        </h1>
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
                    Lesson Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Introduction to Variables"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Short Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Brief overview of what this lesson covers"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="video_url">Video URL (YouTube)</Label>
                  <Input
                    id="video_url"
                    type="url"
                    value={formData.video_url}
                    onChange={(e) =>
                      setFormData({ ...formData, video_url: e.target.value })
                    }
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: Add a YouTube video to this lesson
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sequence">
                    Lesson Order <span className="text-destructive">*</span>
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
                    The order in which this lesson appears in the course
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t">
                <div className="flex items-center gap-2 mb-4">
                  <IconRobot className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg">AI Task Configuration</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai_task_description">Task Prompt (for Students)</Label>
                    <Textarea
                      id="ai_task_description"
                      value={formData.ai_task_description}
                      onChange={(e) =>
                        setFormData({ ...formData, ai_task_description: e.target.value })
                      }
                      placeholder="e.g. Present yourself in English"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the task challenge that will be presented to the student to solve using the chatbot.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai_task_instructions">AI Grading Instructions (Hidden)</Label>
                    <Textarea
                      id="ai_task_instructions"
                      value={formData.ai_task_instructions}
                      onChange={(e) =>
                        setFormData({ ...formData, ai_task_instructions: e.target.value })
                      }
                      placeholder="e.g. Ensure the user uses correct grammar and includes their name, age, and hobbies."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Specific instructions for the AI on how to evaluate if the task is completed correctly.
                    </p>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <PromptTemplateSelector
                      category="lesson_task"
                      onSelect={(template) => {
                        setFormData({
                          ...formData,
                          ai_task_description: template.task_description_template || formData.ai_task_description,
                          ai_task_instructions: template.system_prompt_template || formData.ai_task_instructions,
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

          {/* Markdown Editor */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="content">Lesson Content (Markdown)</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="# Lesson Content

Write your lesson content here using Markdown...

## What You'll Learn
- Point 1
- Point 2

## Step 1: Getting Started
..."
                  rows={20}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use Markdown to format your content. Supports headings, lists, links, images,
                  code blocks, and more.
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
              Save as Draft
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
              Publish Lesson
            </Button>
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="lg:sticky lg:top-8 lg:h-screen lg:overflow-y-auto">
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <IconEye className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold">Preview</h2>
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
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {formData.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-center text-muted-foreground">
                  Start writing to see a preview...
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div >
  )
}
