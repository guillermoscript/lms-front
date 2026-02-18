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
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function TeacherCoursesPage() {
    const supabase = await createClient()
    const t = await getTranslations('dashboard.teacher.courses')
    const tenantId = await getCurrentTenantId()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
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
        .eq('author_id', user.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

    const coursesList = courses || []

    return (
        <div className="flex-1 space-y-8 p-8 pt-6" data-testid="teacher-courses-list">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">
                        {t('title')}
                    </h2>
                    <p className="text-muted-foreground">
                        {t('description')}
                    </p>
                </div>
                <Link href="/dashboard/teacher/courses/new">
                    <Button className="shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95">
                        <IconPlus className="mr-2 h-4 w-4" />
                        {t('createFirstBtn')}
                    </Button>
                </Link>
            </div>

            {/* Filters and Search - Placeholder/UI for now */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between bg-card/50 p-4 rounded-xl border border-border/50 backdrop-blur-sm shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        className="pl-9 bg-background/50 border-none ring-1 ring-border focus-visible:ring-primary/50"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                        <IconFilter size={16} />
                        {t('filter')}
                    </Button>
                    <div className="h-9 w-px bg-border mx-1" />
                    <Button variant="ghost" size="icon" className="h-9 w-9 bg-accent/50 text-primary">
                        <IconLayoutGrid size={18} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground">
                        <IconList size={18} />
                    </Button>
                </div>
            </div>

            {/* Courses Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {coursesList.length > 0 ? (
                    coursesList.map((course, idx) => (
                        <motion.div
                            key={course.course_id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                        >
                            <Card className="group flex flex-col h-full overflow-hidden border-none shadow-lg ring-1 ring-border/50 bg-card/80 backdrop-blur-sm hover:ring-primary/30 transition-all duration-300">
                                {/* Thumbnail */}
                                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                                    {course.thumbnail_url ? (
                                        <img
                                            src={course.thumbnail_url}
                                            alt={course.title}
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20">
                                            <IconBook className="h-12 w-12 text-primary/40" />
                                        </div>
                                    )}
                                    <div className="absolute top-3 right-3">
                                        <Badge
                                            variant={course.status === 'published' ? 'default' : 'secondary'}
                                            className="shadow-sm backdrop-blur-md bg-background/80 text-foreground border-border/50"
                                        >
                                            {course.status}
                                        </Badge>
                                    </div>
                                </div>

                                <CardHeader className="pb-3">
                                    <CardTitle className="line-clamp-2 text-xl leading-tight group-hover:text-primary transition-colors">
                                        {course.title}
                                    </CardTitle>
                                    {course.description && (
                                        <CardDescription className="line-clamp-2 mt-2 leading-relaxed">
                                            {course.description}
                                        </CardDescription>
                                    )}
                                </CardHeader>

                                <CardContent className="flex flex-col gap-6 pt-0 mt-auto">
                                    {/* Stats */}
                                    <div className="grid grid-cols-3 gap-1 py-4 border-y border-border/50">
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-foreground leading-none">
                                                {course.enrollments?.[0]?.count || 0}
                                            </p>
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{t('students')}</p>
                                        </div>
                                        <div className="text-center border-x border-border/50">
                                            <p className="text-lg font-bold text-foreground leading-none">
                                                {course.lessons?.[0]?.count || 0}
                                            </p>
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{t('lessons')}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-foreground leading-none">
                                                {course.exams?.[0]?.count || 0}
                                            </p>
                                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{t('exams')}</p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2">
                                        <Link
                                            href={`/dashboard/teacher/courses/${course.course_id}`}
                                            className="flex-1"
                                        >
                                            <Button variant="outline" size="sm" className="w-full h-10 border-border/50 hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all">
                                                <IconEdit className="mr-2 h-4 w-4" />
                                                {t('edit')}
                                            </Button>
                                        </Link>
                                        <Link
                                            href={`/dashboard/student/courses/${course.course_id}`}
                                            className="flex-1"
                                        >
                                            <Button variant="ghost" size="sm" className="w-full h-10 hover:bg-accent/50 group/preview">
                                                <IconEye className="mr-2 h-4 w-4" />
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
                        <Card className="border-dashed border-2 bg-muted/20">
                            <CardContent className="flex flex-col items-center py-20">
                                <div className="p-4 bg-primary/10 rounded-full mb-6 text-primary">
                                    <IconBook size={48} className="opacity-40" />
                                </div>
                                <h3 className="text-2xl font-bold mb-2">{t('noCoursesFound')}</h3>
                                <p className="text-muted-foreground mb-8 text-center max-w-sm">
                                    {t('noCoursesDesc')}
                                </p>
                                <Link href="/dashboard/teacher/courses/new">
                                    <Button size="lg" className="px-8 shadow-xl shadow-primary/20">
                                        <IconPlus className="mr-2" />
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
