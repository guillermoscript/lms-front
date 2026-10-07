import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/** Onboarding prompt for dashboards with no courses yet. */
export function CourseArchitectCta() {
    const t = useTranslations('courseArchitect.cta')
    return (
        <Card>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <IconSparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div>
                        <p className="text-sm font-semibold">{t('title')}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
                    </div>
                </div>
                <Link href="/dashboard/teacher/courses/ai" className="shrink-0">
                    <Button size="sm" className="gap-2" data-testid="course-architect-cta">
                        <IconSparkles className="h-3.5 w-3.5" aria-hidden />
                        {t('button')}
                    </Button>
                </Link>
            </CardContent>
        </Card>
    )
}
