'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  IconPlus,
  IconX,
  IconCircleCheck,
  IconCircleX,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { useExamBuilder, type QuestionData } from './exam-builder-context'

interface ExamQuestionOptionsProps {
  question: QuestionData
}

export function ExamQuestionOptions({ question: q }: ExamQuestionOptionsProps) {
  const { updateQuestion } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')

  return (
    <div className="space-y-3 pt-4 border-t">
      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {t('answerOptionsLabel')}
      </Label>
      <div className="space-y-2">
        {q.options.map((opt, oIdx) => (
          <div key={opt.id} className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "shrink-0 rounded-full h-8 w-8 p-0 border flex items-center justify-center",
                opt.is_correct ? "bg-green-600 border-green-600 text-white" : "border-muted-foreground/30 text-muted-foreground"
              )}
              onClick={() => {
                const newOpts = q.options.map((o) => ({
                  ...o,
                  is_correct: o.id === opt.id,
                }))
                updateQuestion(q.id, { options: newOpts })
              }}
            >
              {opt.is_correct ? <IconCircleCheck className="h-5 w-5" /> : <IconCircleX className="h-5 w-5 opacity-20" />}
            </Button>
            <Input
              value={opt.option_text}
              onChange={(e) => {
                const newOpts = q.options.map((o) =>
                  o.id === opt.id ? { ...o, option_text: e.target.value } : o
                )
                updateQuestion(q.id, { options: newOpts })
              }}
              placeholder={t('optionPlaceholder', { index: oIdx + 1 })}
              disabled={q.question_type === 'true_false'}
              className={cn(opt.is_correct && "border-green-400 focus-visible:ring-green-400 bg-green-50/30 dark:bg-green-950/30")}
            />
            {q.question_type === 'multiple_choice' && q.options.length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newOpts = q.options.filter((o) => o.id !== opt.id)
                  updateQuestion(q.id, { options: newOpts })
                }}
                aria-label={t('removeOption')}
              >
                <IconX className="h-3 w-3" />
              </Button>
            )}
            {opt.is_correct && (
              <span className="text-[10px] font-black uppercase text-green-600 dark:text-green-400 shrink-0">
                {t('correctLabel')}
              </span>
            )}
          </div>
        ))}
      </div>
      {q.question_type === 'multiple_choice' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const newOpts = [
              ...q.options,
              { id: `opt-new-${Date.now()}`, option_text: '', is_correct: false },
            ]
            updateQuestion(q.id, { options: newOpts })
          }}
          className="w-full border-dashed"
        >
          <IconPlus className="h-3 w-3" /> {t('addOption')}
        </Button>
      )}
      {q.question_type === 'true_false' && (
        <p className="text-xs text-muted-foreground italic">
          {t('trueFalseHint')}
        </p>
      )}
    </div>
  )
}
