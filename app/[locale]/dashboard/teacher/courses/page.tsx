import { ContentListExplorer } from '@/components/teacher/content-list-explorer'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    IconPlus,
    IconBook,
    IconEdit,
    IconEye,
    IconSparkles,
} from '@tabler/icons-react'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import Image from 'next/image'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export default async function TeacherCoursesPage() {
    const supabase = await createClient()
    const t = await getTranslations('dashboard.teacher.courses')
    const tArchitect = await getTranslations('courseArchitect')
    const tenantId = await getCurrentTenantId()

    const userId = await getCurrentUserId()
    if (!userId) {
        redirect('/auth/login')
    }

    // Get all courses created by this teacher
    const { data: courses } = await supabase
        .from('courses')
        .select(`
            *,
            lessons:lessons(count),
            exams:exams(count),
            enrollments:enrollments(count)
        `)
        .eq('author_id', userId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

    const coursesList = courses || []

    return (
        <PageShell variant="default" data-testid="teacher-courses-list">
            <PageHeader
                title={t('title')}
                description={t('description')}
                actions={
                    <>
                        <Link href="/dashboard/teacher/courses/ai">
                            <Button size="sm" variant="outline" className="gap-2">
                                <IconSparkles className="h-3.5 w-3.5" />
                                {tArchitect('createWithAi')}
                            </Button>
                        </Link>
                        <Link href="/dashboard/teacher/courses/new">
                            <Button size="sm" className="gap-2">
                                <IconPlus className="h-3.5 w-3.5" />
                                {t('createFirstBtn')}
                            </Button>
                        </Link>
                    </>
                }
            />

            <ContentListExplorer kind="courses"
                items={coursesList.map((course) => ({ id: course.course_id, title: course.title, status: course.status, createdAt: course.created_at, content: (
                    <div key={course.course_id}>
                            <Card className="group flex flex-col h-full overflow-hidden transition-all duration-200 hover:shadow-md hover:ring-1 hover:ring-primary/20">
                                {/* Thumbnail */}
                                <div data-course-thumbnail className="relative aspect-video w-full overflow-hidden bg-muted">
                                    {course.thumbnail_url ? (
                                        <Image
                                            src={course.thumbnail_url}
                                            alt={course.title}
                                            fill
                                            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/15">
                                            <IconBook className="h-10 w-10 text-brand-text/40" />
                                        </div>
                                    )}
                                    <div className="absolute top-2.5 right-2.5">
                                        <Badge
                                            variant={course.status === 'published' ? 'default' : 'secondary'}
                                            className={`text-[10px] ${course.status === 'published' ? 'bg-success text-success-foreground' : 'bg-background/80 backdrop-blur-sm'}`}
                                        >
                                            {t(`status.${course.status}`)}
                                        </Badge>
                                    </div>
                                </div>

                                <CardHeader className="pb-2">
                                    <CardTitle className="line-clamp-2 text-base leading-tight group-hover:text-brand-text transition-colors">
                                        {course.title}
                                    </CardTitle>
                                    {course.description && (
                                        <CardDescription className="line-clamp-2 mt-1.5 text-xs leading-relaxed">
                                            {course.description}
                                        </CardDescription>
                                    )}
                                </CardHeader>

                                <CardContent className="flex flex-col gap-4 pt-0 mt-auto">
                                    {/* Stats */}
                                    <div className="grid grid-cols-3 gap-1 py-3 border-y border-border/40">
                                        <div className="text-center">
                                            <p className="text-base font-bold tabular-nums leading-none">
                                                {course.enrollments?.[0]?.count || 0}
                                            </p>
                                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{t('students')}</p>
                                        </div>
                                        <div className="text-center border-x border-border/40">
                                            <p className="text-base font-bold tabular-nums leading-none">
                                                {course.lessons?.[0]?.count || 0}
                                            </p>
                                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{t('lessons')}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-base font-bold tabular-nums leading-none">
                                                {course.exams?.[0]?.count || 0}
                                            </p>
                                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{t('exams')}</p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2">
                                        <Link
                                            href={`/dashboard/teacher/courses/${course.course_id}`}
                                            className="flex-1"
                                        >
                                            <Button variant="outline" size="sm" className="w-full gap-2 text-xs hover:text-brand-text hover:border-primary/40 transition-colors">
                                                <IconEdit className="h-3.5 w-3.5" />
                                                {t('edit')}
                                            </Button>
                                        </Link>
                                        <Link
                                            href={`/dashboard/teacher/courses/${course.course_id}/preview`}
                                            className="flex-1"
                                        >
                                            <Button variant="ghost" size="sm" className="w-full gap-2 text-xs">
                                                <IconEye className="h-3.5 w-3.5" />
                                                {t('preview')}
                                            </Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                ) }))}
                emptyState={(
                    <div className="col-span-full">
                        <Card className="border-dashed border-2">
                            <CardContent className="flex flex-col items-center py-16">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                                    <IconBook size={28} className="text-muted-foreground/40" />
                                </div>
                                <h3 className="text-xl font-bold mb-1.5">{t('noCoursesFound')}</h3>
                                <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                                    {t('noCoursesDesc')}
                                </p>
                                <Link href="/dashboard/teacher/courses/new">
                                    <Button className="gap-2">
                                        <IconPlus className="h-4 w-4" />
                                        {t('createFirstBtn')}
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    </div>
                )}
            />
        </PageShell>
    )
}
