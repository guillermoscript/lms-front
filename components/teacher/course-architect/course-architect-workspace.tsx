'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconExternalLink } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CourseArchitectChat, type ContentChange } from './course-architect-chat'
import { CourseBlueprint } from './course-blueprint'
import { courseIdFromCreateResult, type ArchitectScope } from './scope'

interface Props {
    initialCourseId: number | null
    tenantId: string
    locale: 'en' | 'es'
}

export function CourseArchitectWorkspace({ initialCourseId, tenantId, locale }: Props) {
    const t = useTranslations('courseArchitect')
    const router = useRouter()
    const [courseId, setCourseId] = useState<number | null>(initialCourseId)
    const [refreshKey, setRefreshKey] = useState(0)
    const [tab, setTab] = useState<'chat' | 'blueprint'>('chat')
    // Outline changed while the user was on the Chat tab (mobile): dot on the tab + polite announcement.
    const [outlineChanged, setOutlineChanged] = useState(0)
    const tabRef = useRef(tab)
    useEffect(() => {
        tabRef.current = tab
    }, [tab])

    const onTabChange = (v: 'chat' | 'blueprint') => {
        setTab(v)
        if (v === 'blueprint') setOutlineChanged(0)
    }

    const scope: ArchitectScope = courseId ? { type: 'course', courseId } : { type: 'new' }

    const onContentChanged = useCallback(
        (change: ContentChange) => {
            if (change.toolName === 'lms_create_course') {
                const id = courseIdFromCreateResult(change.output)
                if (id) setCourseId(id)
            }
            setRefreshKey((k) => k + 1)
            if (tabRef.current !== 'blueprint') setOutlineChanged((n) => n + 1)
            router.refresh()
        },
        [router]
    )

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Mobile pane switcher; both panes stay mounted so the chat keeps its state. */}
                <Tabs value={tab} onValueChange={(v) => onTabChange(v as 'chat' | 'blueprint')} className="lg:hidden">
                    <TabsList>
                        <TabsTrigger value="chat">{t('chatTab')}</TabsTrigger>
                        <TabsTrigger value="blueprint" className="gap-1.5">
                            {t('blueprintTab')}
                            {outlineChanged > 0 && (
                                <span
                                    className="size-1.5 rounded-full bg-primary"
                                    data-testid="outline-changed-dot"
                                    aria-hidden
                                />
                            )}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                {courseId && (
                    <Link href={`/dashboard/teacher/courses/${courseId}`} className="ml-auto">
                        <Button size="sm" variant="outline" className="gap-2">
                            <IconExternalLink className="size-3.5" aria-hidden />
                            {t('openCourse')}
                        </Button>
                    </Link>
                )}
            </div>

            <div className="sr-only" role="status" aria-live="polite">
                {outlineChanged > 0 && <span key={outlineChanged}>{t('outlineUpdated')}</span>}
            </div>

            <div className="grid h-[calc(100dvh-16rem)] min-h-[26rem] gap-4 lg:h-[calc(100dvh-14rem)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <section
                    aria-label={t('chatTab')}
                    className={cn(
                        'min-h-0 overflow-hidden rounded-card bg-card ring-1 ring-foreground/10',
                        tab !== 'chat' && 'max-lg:hidden'
                    )}
                >
                    <CourseArchitectChat
                        scope={scope}
                        locale={locale}
                        onContentChanged={onContentChanged}
                        className="flex h-full min-h-0 flex-col"
                    />
                </section>
                <aside
                    aria-label={t('blueprintTab')}
                    className={cn(
                        'min-h-0 overflow-y-auto rounded-card bg-card ring-1 ring-foreground/10',
                        tab !== 'blueprint' && 'max-lg:hidden'
                    )}
                >
                    <CourseBlueprint courseId={courseId} tenantId={tenantId} refreshKey={refreshKey} />
                </aside>
            </div>
        </div>
    )
}
