import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  IconArrowLeft,
  IconPlus,
  IconEye,
  IconSettings,
  IconUsers,
  IconBook,
  IconFileText,
  IconTarget,
  IconCertificate,
  IconAward,
  IconExternalLink,
  IconClock,
  IconVideo,
  IconChevronRight,
} from '@tabler/icons-react'
import { CourseStudentsTable } from '@/components/teacher/course-students-table'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { CourseEditorTour } from '@/components/tours/course-editor-tour'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled } from '@/lib/ui-state-keys'

interface PageProps {
  params: Promise<{ courseId: string }>
}

interface IssuedCertificate {
  certificate_id: string
  issued_at: string
  verification_code: string
  pdf_url: string
  profiles?: { full_name?: string | null; avatar_url?: string | null } | null
}

function getInitials(name: string | null | undefined) {
  if (!name) return ''
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default async function CourseManagementPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()

  if (courseError || !course) {
    return (
      <div className="p-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <IconArrowLeft /> {t('notFound')}
            </CardTitle>
            <CardDescription>
              {t('notFoundDesc', { courseId })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/teacher/courses">
              <Button variant="outline">{t('backToCourses')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Ownership check - simplified for debugging but keeping security in mind
  const isOwner = course.author_id === userId

  if (!isOwner) {
    return (
      <div className="p-8">
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t('accessDenied')}
            </CardTitle>
            <CardDescription>
              {t('notAuthor')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/teacher/courses">
              <Button variant="outline">{t('backToCourses')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch all related data in parallel
  const [lessonsRes, exercisesRes, examsRes, enrollmentsRes, certificateTemplateRes, issuedCertificatesRes, uiState] = await Promise.all([
    supabase
      .from('lessons')
      .select('*')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .order('sequence', { ascending: true }),
    supabase
      .from('exercises')
      .select('*')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabase
      .from('exams')
      .select('*')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .order('sequence', { ascending: true }),
    supabase
      .from('enrollments')
      .select('enrollment_id, user_id, course_id, enrollment_date, status, tenant_id')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    supabase
      .from('certificate_templates')
      .select('*')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('certificates')
      .select('*, profiles!certificates_user_id_fkey(full_name, avatar_url)')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .order('issued_at', { ascending: false }),
    getUiState(userId),
  ])

  const lessons = lessonsRes.data || []
  const exercises = exercisesRes.data || []
  const exams = examsRes.data || []
  const rawEnrollments = enrollmentsRes.data || []
  const certificateTemplate = certificateTemplateRes.data
  const issuedCertificates = issuedCertificatesRes.data || []

  // Fetch profiles for enrolled users (no FK between enrollments and profiles).
  // Filter nulls + dedupe: a null id makes PostgREST reject the whole .in() query.
  const enrolledUserIds = [...new Set(rawEnrollments.map((e) => e.user_id).filter(Boolean))]
  const { data: enrollmentProfiles } = enrolledUserIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', enrolledUserIds)
    : { data: [] }
  const profilesMap = new Map((enrollmentProfiles || []).map((p) => [p.id, p]))
  const enrollments = rawEnrollments.map((e) => ({
    ...e,
    profiles: profilesMap.get(e.user_id) || null,
  }))

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Guided Tour */}
      <CourseEditorTour
        userId={userId}
        completed={isTourCompleted(uiState, 'course-editor')}
        toursEnabled={areToursEnabled(uiState)}
      />

      {/* Header */}
      <header data-tour="course-header" className="border-b bg-card sticky top-0 z-10">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <Link href="/dashboard/teacher" className="shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('backToCourses')}>
                    <IconArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <h1 className="text-2xl font-bold tracking-tight truncate">{course.title}</h1>
                <Badge variant={course.status === 'published' ? 'default' : 'secondary'}>
                  {t(`status.${course.status}`)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground ml-10">
                {t('enrolledCount', { count: enrollments.length })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/dashboard/teacher/courses/${courseId}/preview`} data-tour="course-preview">
                <Button variant="outline" size="sm" className="gap-2">
                  <IconEye className="h-3.5 w-3.5" />
                  {t('tabs.preview')}
                </Button>
              </Link>
              <Link href={`/dashboard/teacher/courses/${courseId}/settings`} data-tour="course-settings">
                <Button variant="outline" size="sm" className="gap-2">
                  <IconSettings className="h-3.5 w-3.5" />
                  {t('settings')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="lessons" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList data-tour="course-tabs" className="bg-muted/50 p-1 inline-flex w-auto min-w-full sm:w-full">
              <TabsTrigger value="lessons" className="flex items-center gap-2 whitespace-nowrap">
                <IconBook size={16} /> {t('tabs.lessons')}
                {lessons.length > 0 && <span className="ml-0.5 text-xs text-muted-foreground">{lessons.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="exercises" className="flex items-center gap-2 whitespace-nowrap">
                <IconTarget size={16} /> {t('tabs.exercises')}
                {exercises.length > 0 && <span className="ml-0.5 text-xs text-muted-foreground">{exercises.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="exams" className="flex items-center gap-2 whitespace-nowrap">
                <IconFileText size={16} /> {t('tabs.exams')}
                {exams.length > 0 && <span className="ml-0.5 text-xs text-muted-foreground">{exams.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="students" className="flex items-center gap-2 whitespace-nowrap">
                <IconUsers size={16} /> {t('tabs.students')}
                {enrollments.length > 0 && <span className="ml-0.5 text-xs text-muted-foreground">{enrollments.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="certificates" className="flex items-center gap-2 whitespace-nowrap">
                <IconCertificate size={16} /> {t('tabs.certificates')}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Lessons Tab */}
          <TabsContent value="lessons" className="space-y-4" data-tour="course-lessons">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('curriculum.title')}</h2>
              <Link href={`/dashboard/teacher/courses/${courseId}/lessons/new`}>
                <Button size="sm" className="gap-2">
                  <IconPlus className="h-3.5 w-3.5" />
                  {t('curriculum.addLesson')}
                </Button>
              </Link>
            </div>

            <div className="grid gap-2">
              {lessons.length > 0 ? (
                lessons.map((lesson) => (
                  <Link key={lesson.id} href={`/dashboard/teacher/courses/${courseId}/lessons/${lesson.id}`} className="block">
                    <Card className="group transition-all duration-200 hover:shadow-md hover:border-primary/50 cursor-pointer">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold text-sm">
                            {lesson.sequence}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium group-hover:text-primary transition-colors truncate">{lesson.title}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              {lesson.status !== 'published' && (
                                <Badge variant="secondary" className="text-[10px] h-4">
                                  {t(`status.${lesson.status}`)}
                                </Badge>
                              )}
                              {lesson.video_url && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <IconVideo className="h-3 w-3" />
                                  {t('video')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <IconChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                      <IconBook size={28} className="text-muted-foreground/40" />
                    </div>
                    <h3 className="text-xl font-bold mb-1.5">{t('curriculum.noLessons')}</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-6">
                      {t('curriculum.description')}
                    </p>
                    <Link href={`/dashboard/teacher/courses/${courseId}/lessons/new`}>
                      <Button className="gap-2">
                        <IconPlus className="h-4 w-4" />
                        {t('curriculum.createFirst')}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Exercises Tab */}
          <TabsContent value="exercises" className="space-y-4" data-tour="course-exercises">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('practice.title')}</h2>
              <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
                <Button size="sm" className="gap-2">
                  <IconPlus className="h-3.5 w-3.5" />
                  {t('practice.addExercise')}
                </Button>
              </Link>
            </div>

            <div className="grid gap-2">
              {exercises.length > 0 ? (
                exercises.map((exercise) => (
                  <Link key={exercise.id} href={`/dashboard/teacher/courses/${courseId}/exercises/${exercise.id}`} className="block">
                    <Card className="group transition-all duration-200 hover:shadow-md hover:border-emerald-500/50 cursor-pointer">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <IconTarget size={18} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium group-hover:text-primary transition-colors truncate">{exercise.title}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground capitalize">
                                {(exercise.exercise_type || '').replace('_', ' ')}
                              </span>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-xs text-muted-foreground capitalize">
                                {t(`difficulty.${exercise.difficulty_level}`)}
                              </span>
                              {exercise.status !== 'published' && (
                                <>
                                  <span className="text-muted-foreground/30">·</span>
                                  <Badge variant="secondary" className="text-[10px] h-4">
                                    {t(`status.${exercise.status}`)}
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <IconChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                      <IconTarget size={28} className="text-muted-foreground/40" />
                    </div>
                    <h3 className="text-xl font-bold mb-1.5">{t('practice.noExercises')}</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-6">
                      {t('practice.description')}
                    </p>
                    <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
                      <Button className="gap-2">
                        <IconPlus className="h-4 w-4" />
                        {t('practice.createFirst')}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Exams Tab */}
          <TabsContent value="exams" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('assessments.title')}</h2>
              <Link href={`/dashboard/teacher/courses/${courseId}/exams/new`}>
                <Button size="sm" className="gap-2">
                  <IconPlus className="h-3.5 w-3.5" />
                  {t('assessments.addExam')}
                </Button>
              </Link>
            </div>

            <div className="grid gap-2">
              {exams.length > 0 ? (
                exams.map((exam) => (
                  <Link key={exam.exam_id} href={`/dashboard/teacher/courses/${courseId}/exams/${exam.exam_id}`} className="block">
                    <Card className="group transition-all duration-200 hover:shadow-md hover:border-amber-500/50 cursor-pointer">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                            <IconFileText size={18} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium group-hover:text-primary transition-colors truncate">{exam.title}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <IconClock className="h-3 w-3" />
                                {exam.duration} {t('min')}
                              </span>
                              {exam.status !== 'published' && (
                                <>
                                  <span className="text-muted-foreground/30">·</span>
                                  <Badge variant="secondary" className="text-[10px] h-4">
                                    {t(`status.${exam.status}`)}
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <IconChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                      <IconFileText size={28} className="text-muted-foreground/40" />
                    </div>
                    <h3 className="text-xl font-bold mb-1.5">{t('assessments.noExams')}</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-6">
                      {t('assessments.description')}
                    </p>
                    <Link href={`/dashboard/teacher/courses/${courseId}/exams/new`}>
                      <Button className="gap-2">
                        <IconPlus className="h-4 w-4" />
                        {t('assessments.createFirst')}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('studentList.title')}</h2>
            </div>

            <CourseStudentsTable
              enrollments={enrollments}
              issuedCertificates={issuedCertificates}
              courseId={parseInt(courseId)}
            />
          </TabsContent>

          {/* Certificates Tab
             NOTE: IssueCertificateButton is intentionally available in BOTH the Students tab
             and this Certificates tab. Students tab is for quick per-student actions;
             this tab provides the full certificate management view with template preview
             and issued certificates history. If this redundancy becomes confusing,
             consider removing it from the Students tab and keeping it only here. */}
          <TabsContent value="certificates" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('certificates.title')}</h2>
              <Link href={`/dashboard/teacher/courses/${courseId}/certificates/settings`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <IconSettings className="h-3.5 w-3.5" />
                  {certificateTemplate ? t('certificates.templates.edit') : t('certificates.templates.create')}
                </Button>
              </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1 space-y-6">
                {certificateTemplate ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('certificates.templates.title')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase">{t('certificates.templates.nameLabel')}</Label>
                        <p className="font-medium">{certificateTemplate.template_name}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase">{t('certificates.templates.issuerNameLabel')}</Label>
                        <p className="text-sm">{certificateTemplate.issuer_name}</p>
                      </div>
                      <div className="pt-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded-full border"
                            style={{ backgroundColor: certificateTemplate.design_settings?.primary_color }}
                          />
                          <span className="text-xs text-muted-foreground">{t('certificates.templates.primaryColor')}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-dashed border-2">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                        <IconAward size={28} className="text-muted-foreground/40" />
                      </div>
                      <h3 className="font-semibold mb-1">{t('certificates.templates.noTemplate')}</h3>
                      <Link href={`/dashboard/teacher/courses/${courseId}/certificates/settings`} className="mt-4">
                        <Button variant="outline" size="sm">
                          {t('certificates.templates.create')}
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg">{t('certificates.issued.title')}</CardTitle>
                    {issuedCertificates.length > 0 && (
                      <Badge variant="secondary">
                        {t('certificates.issued.count', { count: issuedCertificates.length })}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-4">{t('certificates.issued.table.student')}</TableHead>
                          <TableHead className="px-4">{t('certificates.issued.table.date')}</TableHead>
                          <TableHead className="px-4">{t('certificates.issued.table.code')}</TableHead>
                          <TableHead className="px-4 text-right">{t('certificates.issued.table.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {issuedCertificates.length > 0 ? (
                          (issuedCertificates as IssuedCertificate[]).map((cert) => (
                            <TableRow key={cert.certificate_id}>
                              <TableCell className="px-4">
                                <div className="flex items-center gap-2">
                                  <Avatar size="sm">
                                    {cert.profiles?.avatar_url && (
                                      <AvatarImage src={cert.profiles.avatar_url} alt={cert.profiles?.full_name || ''} />
                                    )}
                                    <AvatarFallback>{getInitials(cert.profiles?.full_name)}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium truncate">{cert.profiles?.full_name || '—'}</span>
                                </div>
                              </TableCell>
                              <TableCell className="px-4 whitespace-nowrap text-muted-foreground">
                                {new Date(cert.issued_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="px-4 font-mono text-xs uppercase">
                                {cert.verification_code}
                              </TableCell>
                              <TableCell className="px-4 text-right">
                                <a href={cert.pdf_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="sm" aria-label={t('certificates.issued.view')}>
                                    <IconExternalLink className="h-4 w-4" />
                                  </Button>
                                </a>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                              {t('certificates.issued.noIssued')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
