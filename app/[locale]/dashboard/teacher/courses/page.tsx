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
    IconSearch,
    IconFilter,
    IconLayoutGrid,
    IconList,
    IconChevronRight
} from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import * as motion from 'motion/react-client'
import Image from 'next/image'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export default async function TeacherCoursesPage() {
    const supabase = await createClient()
    const t = await getTranslations('dashboard.teacher.courses')
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
        <div className="flex-1 space-y-6 p-6 lg:p-8" data-testid="teacher-courses-list">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                        {t('title')}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {t('description')}
                    </p>
                </div>
                <Link href="/dashboard/teacher/courses/new">
                    <Button size="sm" className="gap-2">
                        <IconPlus className="h-3.5 w-3.5" />
                        {t('createFirstBtn')}
                    </Button>
                </Link>
            </div>

            {/* Filters and Search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        className="pl-9 h-8 text-sm"
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                        <IconFilter size={14} />
                        {t('filter')}
                    </Button>
                    <div className="h-6 w-px bg-border mx-0.5" />
                    <Button variant="ghost" size="icon-sm" className="text-primary bg-primary/5" aria-label={t('grid')}>
                        <IconLayoutGrid size={16} />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('list')}>
                        <IconList size={16} />
                    </Button>
                </div>
            </div>

            {/* Courses Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {coursesList.length > 0 ? (
                    coursesList.map((course, idx) => (
                        <motion.div
                            key={course.course_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04, duration: 0.25 }}
                        >
                            <Card className="group flex flex-col h-full overflow-hidden transition-all duration-200 hover:shadow-md hover:ring-1 hover:ring-primary/20">
                                {/* Thumbnail */}
                                <div className="relative aspect-video w-full overflow-hidden bg-muted">
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
                                            <IconBook className="h-10 w-10 text-primary/30" />
                                        </div>
                                    )}
                                    <div className="absolute top-2.5 right-2.5">
                                        <Badge
                                            variant={course.status === 'published' ? 'default' : 'secondary'}
                                            className={`text-[10px] backdrop-blur-sm ${course.status === 'published' ? 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-400' : 'bg-background/80'}`}
                                        >
                                            {t(`status.${course.status}`)}
                                        </Badge>
                                    </div>
                                </div>

                                <CardHeader className="pb-2">
                                    <CardTitle className="line-clamp-2 text-base leading-tight group-hover:text-primary transition-colors">
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
                                            <Button variant="outline" size="sm" className="w-full gap-2 text-xs hover:text-primary hover:border-primary/40 transition-colors">
                                                <IconEdit className="h-3.5 w-3.5" />
                                                {t('edit')}
                                            </Button>
                                        </Link>
                                        <Link
                                            href={`/dashboard/student/courses/${course.course_id}`}
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
                        </motion.div>
                    ))
                ) : (
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
            </div>
        </div>
    )
}
