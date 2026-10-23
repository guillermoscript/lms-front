'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconClock, IconUpload, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { ImagePicker } from '@/components/teacher/image-picker'
import { useExamBuilder } from './exam-builder-context'

export function ExamDetailsCard() {
  const { formData, updateField } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('details')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">{t('titleLabel')} <span className="text-destructive">*</span></Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder={t('titlePlaceholder')}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">{t('descriptionLabel')}</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="image">{t('imageLabel')}</Label>
          {formData.image && (
            <div className="relative w-full max-w-sm overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={formData.image} alt="" className="aspect-video w-full object-cover" />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute right-2 top-2 h-7 w-7 p-0"
                aria-label={t('removeImage')}
                onClick={() => updateField('image', '')}
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <ImagePicker
              onSelect={(url) => updateField('image', url)}
              trigger={
                <Button type="button" variant="outline">
                  <IconUpload className="mr-2 h-4 w-4" />
                  {t('uploadImage')}
                </Button>
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('imageHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="duration" className="flex items-center gap-1.5">
              <IconClock className="h-4 w-4" />
              {t('durationLabel')}
            </Label>
            <Input
              id="duration"
              type="number"
              value={formData.duration || ''}
              onChange={(e) =>
                updateField('duration', e.target.value ? parseInt(e.target.value) : 60)
              }
              placeholder={t('durationPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('durationHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sequence">{t('sequenceLabel')}</Label>
            <Input
              id="sequence"
              type="number"
              value={formData.sequence}
              onChange={(e) =>
                updateField('sequence', parseInt(e.target.value) || 1)
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
