'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createCourse, updateCourse, checkCourseLimit } from '@/app/actions/teacher/courses'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { IconLoader2, IconArrowLeft, IconAlertTriangle } from '@tabler/icons-react'
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
  const t = useTranslations('dashboard.teacher.courseForm')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limitInfo, setLimitInfo] = useState<{
    canCreate: boolean
    currentCount: number
    limit: number
    plan: string
  } | null>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    thumbnail_url: initialData?.thumbnail_url || '',
    category_id: initialData?.category_id?.toString() || '',
    status: initialData?.status || 'draft',
  })

  // Check course limit on mount for new courses
  useEffect(() => {
    if (!initialData) {
      checkCourseLimit().then(setLimitInfo)
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const courseData = {
        title: formData.title,
        description: formData.description || null,
        thumbnail_url: formData.thumbnail_url || null,
        category_id: formData.category_id ? parseInt(formData.category_id) : null,
        status: formData.status as 'draft' | 'published' | 'archived',
      }

      if (initialData) {
        // Update existing course
        await updateCourse(initialData.course_id, courseData)
        router.push(`/dashboard/teacher/courses/${initialData.course_id}`)
      } else {
        // Create new course
        const course = await createCourse(courseData)
        router.push(`/dashboard/teacher/courses/${course.course_id}`)
      }
    } catch (err: any) {
      console.error('Error saving course:', err)
      setError(err.message || t('saveError'))
      setLoading(false)
    }
  }

  // Show limit reached error for new courses
  if (!initialData && limitInfo && !limitInfo.canCreate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="destructive">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('limitReached')}</AlertTitle>
            <AlertDescription>
              {t('limitReachedDesc', { plan: limitInfo.plan, limit: limitInfo.limit, current: limitInfo.currentCount })}
            </AlertDescription>
          </Alert>
          <div className="flex gap-3">
            <Link href="/dashboard/teacher" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                <IconArrowLeft className="mr-2 h-4 w-4" />
                {t('actions.cancel')}
              </Button>
            </Link>
            <Link href="/pricing" className="flex-1">
              <Button className="w-full">
                {t('upgradePlan')}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Show warning if approaching limit */}
          {!initialData && limitInfo && limitInfo.canCreate && limitInfo.currentCount / limitInfo.limit > 0.8 && (
            <Alert>
              <IconAlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('approachingLimit')}</AlertTitle>
              <AlertDescription>
                {t('approachingLimitDesc', { current: limitInfo.currentCount, limit: limitInfo.limit, plan: limitInfo.plan })}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">
              {t('titleLabel')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('titlePlaceholder')}
              maxLength={100}
              required
            />
            {formData.title.length > 80 && (
              <p className="text-xs text-muted-foreground">{formData.title.length}/100</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('descriptionLabel')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('descriptionPlaceholder')}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thumbnail_url">{t('thumbnailLabel')}</Label>
            <Input
              id="thumbnail_url"
              type="url"
              value={formData.thumbnail_url}
              onChange={(e) =>
                setFormData({ ...formData, thumbnail_url: e.target.value })
              }
              placeholder={t('thumbnailPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('thumbnailHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{t('categoryLabel')}</Label>
            <Select
              value={formData.category_id || undefined}
              onValueChange={(value) =>
                setFormData({ ...formData, category_id: value || '' })
              }
            >
              <SelectTrigger id="category">
                <SelectValue placeholder={t('categoryPlaceholder')} />
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
            <Label htmlFor="status">{t('statusLabel')}</Label>
            <Select
              value={formData.status}
              onValueChange={(value: any) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger id="status">
                <SelectValue placeholder={t('statusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t('statusHints.draft')}</SelectItem>
                <SelectItem value="published">{t('statusHints.published')}</SelectItem>
                <SelectItem value="archived">{t('statusHints.archived')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.status === 'draft' && t('statusHints.draft')}
              {formData.status === 'published' && t('statusHints.published')}
              {formData.status === 'archived' && t('statusHints.archived')}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Link href="/dashboard/teacher" className="flex-1">
              <Button type="button" variant="outline" className="w-full" disabled={loading}>
                <IconArrowLeft className="mr-2 h-4 w-4" />
                {t('actions.cancel')}
              </Button>
            </Link>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading && <IconLoader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />}
              {initialData ? t('actions.update') : t('actions.create')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
