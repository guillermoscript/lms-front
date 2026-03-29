'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { IconRobot } from '@tabler/icons-react'
import { useExamBuilder, type QuestionData } from './exam-builder-context'

interface ExamQuestionAIGradingProps {
  question: QuestionData
}

export function ExamQuestionAIGrading({ question: q }: ExamQuestionAIGradingProps) {
  const { updateQuestion } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')

  return (
    <div className="space-y-4 pt-4 border-t bg-primary/5 p-4 rounded-lg border border-primary/20">
      <div className="flex items-center gap-2 mb-1">
        <IconRobot className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-primary">{t('aiGradingNotice')}</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t('gradingRubricLabel')}</Label>
        <Textarea
          value={q.grading_rubric}
          onChange={(e) => updateQuestion(q.id, { grading_rubric: e.target.value })}
          placeholder={t('gradingRubricPlaceholder')}
          rows={2}
          className="bg-white/80 dark:bg-white/10"
        />
        <p className="text-[10px] text-muted-foreground">{t('gradingRubricHint')}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t('aiGradingCriteriaLabel')}</Label>
        <Textarea
          value={q.ai_grading_criteria}
          onChange={(e) => updateQuestion(q.id, { ai_grading_criteria: e.target.value })}
          placeholder={t('aiGradingCriteriaPlaceholder')}
          rows={3}
          className="bg-white/80 dark:bg-white/10"
        />
        <p className="text-[10px] text-muted-foreground">{t('aiGradingCriteriaHint')}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t('expectedKeywordsLabel')}</Label>
        <Input
          value={q.expected_keywords.join(', ')}
          onChange={(e) =>
            updateQuestion(q.id, {
              expected_keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })
          }
          placeholder={t('expectedKeywordsPlaceholder')}
          className="bg-white/80 dark:bg-white/10"
        />
        <p className="text-[10px] text-muted-foreground">{t('expectedKeywordsHint')}</p>
      </div>
    </div>
  )
}
