'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImprovedTemplateSelector } from './improved-template-selector'
import { AIPreviewModal } from './ai-preview-modal'
import { IconLoader2, IconDeviceFloppy, IconRobot, IconInfoCircle } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { VersionHistorySheet } from './version-history-sheet'

interface ExerciseBuilderProps {
  courseId: number
  lessonId?: number
  initialData?: any
}

export function ExerciseBuilder({ courseId, lessonId, initialData }: ExerciseBuilderProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    instructions: initialData?.instructions || '',
    exercise_type: initialData?.exercise_type || 'essay',
    difficulty_level: initialData?.difficulty_level || 'medium',
    time_limit: initialData?.time_limit || 30,
    system_prompt: initialData?.system_prompt || '',
    status: initialData?.status || 'draft',
  })

  // ... handleTemplateApply and handleSave remain similar but using t('updateExercise') etc if needed

  const handleTemplateApply = (data: { instructions: string; system_prompt: string }) => {
    setFormData({
      ...formData,
      instructions: data.instructions,
      system_prompt: data.system_prompt,
    })
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const exerciseData = {
        course_id: courseId,
        lesson_id: lessonId || null,
        title: formData.title,
        description: formData.description,
        instructions: formData.instructions,
        exercise_type: formData.exercise_type,
        difficulty_level: formData.difficulty_level,
        time_limit: formData.time_limit,
        system_prompt: formData.system_prompt,
        status: formData.status,
        created_by: user.id,
      }

      if (initialData) {
        await supabase.from('exercises').update(exerciseData).eq('id', initialData.id)
      } else {
        await supabase.from('exercises').insert([exerciseData])
      }

      router.push(`/dashboard/teacher/courses/${courseId}`)
      router.refresh()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {initialData && (
        <div className="flex justify-end">
          <VersionHistorySheet
            contentType="exercise"
            contentId={initialData.id}
            currentSnapshot={formData}
            onRestore={() => router.refresh()}
          />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('titleLabel')} <span className="text-destructive">*</span></Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('titlePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('typeLabel')}</Label>
                <Select value={formData.exercise_type} onValueChange={(val) => setFormData({ ...formData, exercise_type: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="essay">{t('typeEssay')}</SelectItem>
                    <SelectItem value="coding_challenge">{t('typeCoding')}</SelectItem>
                    <SelectItem value="quiz">{t('typeQuiz')}</SelectItem>
                    <SelectItem value="discussion">{t('typeDiscussion')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('descriptionLabel')}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('descriptionPlaceholder')}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('difficultyLabel')}</Label>
                  <Select value={formData.difficulty_level} onValueChange={(val) => setFormData({ ...formData, difficulty_level: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">{t('difficultyEasy')}</SelectItem>
                      <SelectItem value="medium">{t('difficultyMedium')}</SelectItem>
                      <SelectItem value="hard">{t('difficultyHard')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('timeLimitLabel')}</Label>
                  <Input
                    type="number"
                    value={formData.time_limit}
                    onChange={(e) => setFormData({ ...formData, time_limit: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('statusLabel')}</Label>
                <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full h-12 gap-2 shadow-lg"
            onClick={handleSave}
            disabled={loading || !formData.title}
          >
            {loading ? <IconLoader2 className="animate-spin" size={20} /> : <IconDeviceFloppy size={20} />}
            {initialData ? t('updateExercise') : t('createExercise')}
          </Button>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 shadow-primary/5">
            <CardHeader className="border-b bg-primary/5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <IconRobot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{t('aiConfigTitle')}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t('aiConfigDesc')}</p>
                </div>
                <div className="ml-auto">
                  <ImprovedTemplateSelector category="exercise" onApply={handleTemplateApply} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    {t('studentInsLabel')}
                    <Badge variant="outline" className="text-[10px] py-0 h-4">Visible</Badge>
                  </Label>
                </div>
                <Textarea
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  placeholder={t('studentInsPlaceholder')}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <IconInfoCircle size={12} />
                  {t('studentInsHint')}
                </p>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    {t('aiSystemPromptLabel')}
                    <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-200">Hidden</Badge>
                  </Label>
                </div>
                <Textarea
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  placeholder={t('aiSystemPromptPlaceholder')}
                  rows={8}
                  className="resize-none font-mono text-xs bg-muted/30"
                />
              </div>

              <div className="pt-2">
                <AIPreviewModal
                  type="exercise"
                  config={{
                    system_prompt: formData.system_prompt,
                    instructions: formData.instructions
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
