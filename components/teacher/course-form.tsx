'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconLoader2, IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'

interface Category {
  id: number
  name: string
}

interface CourseFormProps {
  categories: Category[]
  initialData?: {
    course_id: number
    title: string
    description: string | null
    thumbnail_url: string | null
    category_id: number | null
    status: 'draft' | 'published' | 'archived'
  }
}

export function CourseForm({ categories, initialData }: CourseFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    thumbnail_url: initialData?.thumbnail_url || '',
    category_id: initialData?.category_id?.toString() || '',
    status: initialData?.status || 'draft',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      const courseData = {
        title: formData.title,
        description: formData.description || null,
        thumbnail_url: formData.thumbnail_url || null,
        category_id: formData.category_id ? parseInt(formData.category_id) : null,
        author_id: user.id,
        status: formData.status,
      }

      if (initialData) {
        // Update existing course
        const { error: updateError } = await supabase
          .from('courses')
          .update(courseData)
          .eq('course_id', initialData.course_id)

        if (updateError) throw updateError

        router.push(`/dashboard/teacher/courses/${initialData.course_id}`)
      } else {
        // Create new course
        const { data: course, error: insertError } = await supabase
          .from('courses')
          .insert([courseData])
          .select('course_id')
          .single()

        if (insertError) throw insertError

        router.push(`/dashboard/teacher/courses/${course.course_id}`)
      }
    } catch (err: any) {
      console.error('Error saving course:', err)
      setError(err.message || 'Failed to save course')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Course Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">
              Course Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Introduction to Web Development"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what students will learn in this course..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thumbnail_url">Thumbnail URL</Label>
            <Input
              id="thumbnail_url"
              type="url"
              value={formData.thumbnail_url}
              onChange={(e) =>
                setFormData({ ...formData, thumbnail_url: e.target.value })
              }
              placeholder="https://example.com/image.jpg"
            />
            <p className="text-xs text-muted-foreground">
              Provide a URL to an image (16:9 aspect ratio recommended)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category_id || undefined}
              onValueChange={(value) =>
                setFormData({ ...formData, category_id: value || '' })
              }
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: any) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.status === 'draft' && 'Only you can see this course.'}
              {formData.status === 'published' && 'Course is visible to students and ready for enrollment.'}
              {formData.status === 'archived' && 'Course is hidden from catalog but existing students retain access.'}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Link href="/dashboard/teacher" className="flex-1">
              <Button type="button" variant="outline" className="w-full" disabled={loading}>
                <IconArrowLeft className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </Link>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? 'Update Course' : 'Create Course'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
