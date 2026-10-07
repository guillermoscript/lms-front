'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
    IconBook,
    IconFileText,
    IconBarbell,
    IconClipboardCheck,
    IconExternalLink,
} from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Props {
    courseId: number | null
    tenantId: string
    /** Bump to refetch after the agent changes content. */
    refreshKey: number
}

interface Blueprint {
    course: { course_id: number; title: string; status: string; thumbnail_url: string | null } | null
    lessons: { id: number; title: string; status: string; sequence: number | null }[]
    exercises: { id: number; title: string; status: string; lesson_id: number | null; exercise_type: string | null }[]
    exams: { exam_id: number; title: string; status: string; sequence: number | null }[]
}

function StatusBadge({ status }: { status: string }) {
    const t = useTranslations('courseArchitect.blueprint.status')
    const label = t.has(status) ? t(status) : status
    return (
        <Badge
            variant={status === 'published' ? 'default' : 'secondary'}
            className={cn('shrink-0 text-[10px]', status === 'published' && 'bg-success text-success-foreground')}
        >
            {label}
        </Badge>
    )
}

function Row({
    href,
    icon: Icon,
    title,
    status,
    indent,
    sub,
}: {
    href: string
    icon: typeof IconBook
    title: string
    status: string
    indent?: boolean
    sub?: string
}) {
    return (
        <Link
            href={href}
            className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                indent && 'ml-5'
            )}
        >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
                {title}
                {sub && <span className="ml-1.5 text-xs text-muted-foreground">{sub}</span>}
            </span>
            <StatusBadge status={status} />
        </Link>
    )
}

export function CourseBlueprint({ courseId, tenantId, refreshKey }: Props) {
    const t = useTranslations('courseArchitect.blueprint')
    const [retryKey, setRetryKey] = useState(0)
    const [result, setResult] = useState<{ key: string; data: Blueprint | null; failed: boolean } | null>(null)
    const key = `${courseId}:${refreshKey}:${retryKey}`
    const loading = result?.key !== key
    const data = result?.data ?? null
    const failed = result?.failed ?? false

    useEffect(() => {
        if (!courseId) return
        let cancelled = false
        const supabase = createClient()
        ;(async () => {
            const [course, lessons, exercises, exams] = await Promise.all([
                supabase
                    .from('courses')
                    .select('course_id, title, status, thumbnail_url')
                    .eq('course_id', courseId)
                    .eq('tenant_id', tenantId)
                    .maybeSingle(),
                supabase
                    .from('lessons')
                    .select('id, title, status, sequence')
                    .eq('course_id', courseId)
                    .eq('tenant_id', tenantId)
                    .order('sequence', { ascending: true }),
                supabase
                    .from('exercises')
                    .select('id, title, status, lesson_id, exercise_type')
                    .eq('course_id', courseId)
                    .eq('tenant_id', tenantId)
                    .order('id', { ascending: true }),
                supabase
                    .from('exams')
                    .select('exam_id, title, status, sequence')
                    .eq('course_id', courseId)
                    .eq('tenant_id', tenantId)
                    .order('sequence', { ascending: true }),
            ])
            if (cancelled) return
            if (course.error || lessons.error || exercises.error || exams.error) {
                setResult((prev) => ({ key, data: prev?.data ?? null, failed: true }))
            } else {
                setResult({
                    key,
                    failed: false,
                    data: {
                        course: course.data,
                        lessons: lessons.data ?? [],
                        exercises: exercises.data ?? [],
                        exams: exams.data ?? [],
                    },
                })
            }
        })()
        return () => {
            cancelled = true
        }
    }, [courseId, tenantId, refreshKey, retryKey, key])

    if (!courseId) {
        return (
            <div className="flex h-full flex-col items-start justify-center gap-2 p-6 text-muted-foreground">
                <p className="text-sm font-medium text-foreground">{t('emptyTitle')}</p>
                <p className="text-sm leading-relaxed">{t('emptyBody')}</p>
            </div>
        )
    }

    if (!data && loading) {
        return (
            <div className="space-y-2 p-4" role="status" aria-busy="true">
                <span className="sr-only">{t('loading')}</span>
                <Skeleton className="h-6 w-2/3" />
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                ))}
            </div>
        )
    }

    if (failed && !data) {
        return (
            <div className="flex flex-col items-start gap-2 p-4" role="alert">
                <p className="text-sm text-destructive">{t('error')}</p>
                <Button size="sm" variant="outline" onClick={() => setRetryKey((k) => k + 1)}>
                    {t('retry')}
                </Button>
            </div>
        )
    }

    if (!data?.course) {
        return <p className="p-4 text-sm text-muted-foreground">{t('notFound')}</p>
    }

    const base = `/dashboard/teacher/courses/${courseId}`
    const lessonIds = new Set(data.lessons.map((l) => l.id))
    const loose = data.exercises.filter((e) => e.lesson_id == null || !lessonIds.has(e.lesson_id))

    return (
        <div className={cn('space-y-4 p-4 transition-opacity', loading && 'opacity-70')} data-testid="course-blueprint">
            {failed && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
                    <span className="min-w-0">{t('stale')}</span>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setRetryKey((k) => k + 1)}>
                        {t('retry')}
                    </Button>
                </div>
            )}
            <div>
                <Row href={base} icon={IconBook} title={data.course.title} status={data.course.status} />
            </div>

            <section aria-label={t('lessons')} className="space-y-0.5">
                <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                    {t('lessons')} · {data.lessons.length}
                </h3>
                {data.lessons.length === 0 && <p className="px-2 text-sm text-muted-foreground">{t('noLessons')}</p>}
                {data.lessons.map((lesson, i) => (
                    <div key={lesson.id}>
                        <Row
                            href={`${base}/lessons/${lesson.id}`}
                            icon={IconFileText}
                            title={`${i + 1}. ${lesson.title}`}
                            status={lesson.status}
                        />
                        {data.exercises
                            .filter((e) => e.lesson_id === lesson.id)
                            .map((ex) => (
                                <Row
                                    key={ex.id}
                                    indent
                                    href={`${base}/exercises/${ex.id}`}
                                    icon={IconBarbell}
                                    title={ex.title}
                                    status={ex.status}
                                    sub={ex.exercise_type ?? undefined}
                                />
                            ))}
                    </div>
                ))}
            </section>

            {loose.length > 0 && (
                <section aria-label={t('exercises')} className="space-y-0.5">
                    <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                        {t('exercises')} · {loose.length}
                    </h3>
                    {loose.map((ex) => (
                        <Row
                            key={ex.id}
                            href={`${base}/exercises/${ex.id}`}
                            icon={IconBarbell}
                            title={ex.title}
                            status={ex.status}
                            sub={ex.exercise_type ?? undefined}
                        />
                    ))}
                </section>
            )}

            <section aria-label={t('exams')} className="space-y-0.5">
                <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                    {t('exams')} · {data.exams.length}
                </h3>
                {data.exams.length === 0 && <p className="px-2 text-sm text-muted-foreground">{t('noExams')}</p>}
                {data.exams.map((exam) => (
                    <Row
                        key={exam.exam_id}
                        href={`${base}/exams/${exam.exam_id}`}
                        icon={IconClipboardCheck}
                        title={exam.title}
                        status={exam.status}
                    />
                ))}
            </section>

            <Link
                href={`${base}`}
                className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
                <IconExternalLink className="size-3.5" aria-hidden />
                {t('openEditor')}
            </Link>
        </div>
    )
}
