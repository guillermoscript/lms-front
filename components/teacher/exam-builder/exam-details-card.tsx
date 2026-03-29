'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconClock } from '@tabler/icons-react'
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
