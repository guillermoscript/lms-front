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
} from '@tabler/icons-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

      if (initialData) {
        // Update existing lesson
        const { error: updateError } = await supabase
          .from('lessons')
          .update(lessonData)
          .eq('id', initialData.id)

        if (updateError) throw updateError
      } else {
        // Create new lesson
        const { error: insertError } = await supabase
          .from('lessons')
          .insert([lessonData])

        if (insertError) throw insertError
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
    </div>
  )
}
