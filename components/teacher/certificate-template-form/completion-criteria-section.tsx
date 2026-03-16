'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { IconChecklist } from '@tabler/icons-react'
import { useCertificateTemplate } from './certificate-template-context'

export function CompletionCriteriaSection() {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const { formData, setFormData } = useCertificateTemplate()

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                    <IconChecklist className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                    {t('completionCriteria')}
                </h2>
            </div>

            <div className="space-y-5 pl-[42px]">
                {/* Min lesson completion */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{t('minLessonCompletion')}</Label>
                        <span className="text-sm font-mono font-medium tabular-nums text-primary">
                            {formData.min_lesson_completion_pct}%
                        </span>
                    </div>
                    <Slider
                        value={[formData.min_lesson_completion_pct]}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, min_lesson_completion_pct: Array.isArray(v) ? v[0] : v }))}
                        min={0}
                        max={100}
                        step={5}
                    />
                    <p className="text-xs text-muted-foreground">{t('minLessonCompletionHint')}</p>
                </div>

                {/* Min exam pass score */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{t('minExamPassScore')}</Label>
                        <span className="text-sm font-mono font-medium tabular-nums text-primary">
                            {formData.min_exam_pass_score}%
                        </span>
                    </div>
                    <Slider
                        value={[formData.min_exam_pass_score]}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, min_exam_pass_score: Array.isArray(v) ? v[0] : v }))}
                        min={0}
                        max={100}
                        step={5}
                    />
                    <p className="text-xs text-muted-foreground">{t('minExamPassScoreHint')}</p>
                </div>

                {/* Requires all exams */}
                <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-medium">{t('requiresAllExams')}</Label>
                        <p className="text-xs text-muted-foreground">{t('requiresAllExamsHint')}</p>
                    </div>
                    <Switch
                        checked={formData.requires_all_exams}
                        onCheckedChange={checked => setFormData(prev => ({ ...prev, requires_all_exams: checked }))}
                    />
                </div>
            </div>
        </div>
    )
}
