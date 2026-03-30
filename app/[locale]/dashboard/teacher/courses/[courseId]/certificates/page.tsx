import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconArrowLeft, IconChevronRight, IconSettings, IconAward, IconUsers, IconShieldCheck, IconExternalLink } from '@tabler/icons-react'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { CertificatePreview } from '@/components/teacher/certificate-preview'
import { IssueCertificateButton } from '@/components/teacher/issue-certificate-button'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CertificatesPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = createAdminClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const role = await getUserRole()

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()

  if (!course) notFound()

  const isOwner = course.author_id === userId
  const isAdmin = role === 'admin'

  if (!isOwner && !isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-destructive mb-2">{t('accessDenied')}</h1>
        <p className="text-muted-foreground">{t('notAuthor')}</p>
        <Link href={`/dashboard/teacher/courses/${courseId}`} className="mt-6 inline-block">
          <Button variant="outline">{t('backToCourses')}</Button>
        </Link>
      </div>
    )
  }

  // Fetch certificate data in parallel
  const [templateRes, certsRes, enrollmentsRes] = await Promise.all([
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
      .is('revoked_at', null)
      .order('issued_at', { ascending: false }),
    supabase
      .from('enrollments')
      .select('*, profiles(id, full_name, avatar_url)')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
  ])

  const template = templateRes.data
  const certificates = certsRes.data || []
  const enrollments = enrollmentsRes.data || []

  // Students who don't have certificates yet
  const certifiedUserIds = new Set(certificates.map((c: any) => c.user_id))
  const uncertifiedEnrollments = enrollments.filter(
    (e: any) => !certifiedUserIds.has(e.user_id ?? e.profiles?.id)
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2">
        <Link href={`/dashboard/teacher/courses/${courseId}`} aria-label={t('backToCourses')}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate max-w-[200px]">{course.title}</span>
          <IconChevronRight className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground">{t('certificates.title')}</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">{t('certificates.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('certificates.description')}</p>
        </div>
        <Link href={`/dashboard/teacher/courses/${courseId}/certificates/settings`}>
          <Button variant="outline" size="sm" className="gap-2">
            <IconSettings className="h-4 w-4" />
            {template ? t('certificates.templates.edit') : t('certificates.templates.create')}
          </Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <IconAward className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{certificates.length}</p>
                <p className="text-xs text-muted-foreground font-medium">{t('certificates.stats.certificatesIssued')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <IconUsers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{enrollments.length}</p>
                <p className="text-xs text-muted-foreground font-medium">{t('certificates.stats.activeStudents')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <IconShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {template ? (
                    <span className="text-emerald-600 dark:text-emerald-400">{t('certificates.stats.active')}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('certificates.stats.none')}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground font-medium">{t('certificates.stats.templateStatus')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content: Template preview + Issued table */}
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left: Template preview */}
        <div className="lg:col-span-2 space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
            {t('certificates.templatePreview')}
          </h2>

          {template ? (
            <div className="space-y-4">
              <div className="scale-[0.82] origin-top transform-gpu">
                <CertificatePreview
                  templateName={template.template_name}
                  issuerName={template.issuer_name}
                  designSettings={template.design_settings || {
                    primary_color: '#3B82F6',
                    secondary_color: '#1E40AF',
                    show_qr_code: true,
                  }}
                />
              </div>
              <div className="space-y-3 px-1">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('certificates.templates.nameLabel')}</p>
                  <p className="text-sm font-semibold">{template.template_name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('certificates.issuerLabel')}</p>
                  <p className="text-sm">{template.issuer_name}</p>
                </div>
                {template.description && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t('certificates.templates.descriptionLabel')}</p>
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-4 w-4 rounded-full border"
                      style={{ backgroundColor: template.design_settings?.primary_color || '#3B82F6' }}
                    />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t('certificates.templates.primaryColor')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-4 w-4 rounded-full border"
                      style={{ backgroundColor: template.design_settings?.secondary_color || '#1E40AF' }}
                    />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{t('certificates.templates.secondaryColor')}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <IconAward className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium mb-1">{t('certificates.noTemplateConfigured')}</p>
                <p className="text-xs text-muted-foreground mb-4 max-w-[220px]">
                  {t('certificates.templates.noTemplate')}
                </p>
                <Link href={`/dashboard/teacher/courses/${courseId}/certificates/settings`}>
                  <Button variant="outline" size="sm">
                    {t('certificates.templates.create')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Issued certificates + students */}
        <div className="lg:col-span-3 space-y-8">
          {/* Issued Certificates */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                {t('certificates.issued.title')}
              </h2>
              {certificates.length > 0 && (
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {t('certificates.issued.count', { count: certificates.length })}
                </Badge>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('certificates.issued.table.student')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('certificates.issued.table.date')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('certificates.issued.table.code')}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('certificates.issued.table.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {certificates.length > 0 ? (
                        certificates.map((cert: any) => (
                          <tr
                            key={cert.certificate_id}
                            className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center overflow-hidden border">
                                  {cert.profiles?.avatar_url ? (
                                    <img src={cert.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <IconUsers className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </div>
                                <span className="font-medium text-sm">{cert.profiles?.full_name || t('manageCourse.studentList.unknownStudent')}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                              {new Date(cert.issued_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <code className="text-[11px] font-mono bg-muted/50 px-2 py-0.5 rounded border">
                                {cert.verification_code}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {cert.pdf_url && (
                                  <a href={cert.pdf_url} target="_blank" rel="noopener noreferrer" aria-label={t('certificates.issued.view')}>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                      <IconExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-16 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <IconAward className="h-8 w-8 text-muted-foreground/20" />
                              <p className="text-sm text-muted-foreground">
                                {t('certificates.issued.noIssued')}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Issue to enrolled students */}
          {template && uncertifiedEnrollments.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                {t('certificates.eligibleStudents')}
              </h2>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {uncertifiedEnrollments.map((enrollment: any) => {
                      const profile = enrollment.profiles
                      return (
                        <div
                          key={enrollment.enrollment_id}
                          className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center overflow-hidden border">
                              {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <IconUsers className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="text-sm font-medium">{profile?.full_name || t('manageCourse.studentList.unknownStudent')}</span>
                          </div>
                          <IssueCertificateButton
                            courseId={parseInt(courseId)}
                            userId={enrollment.user_id || profile?.id}
                            studentName={profile?.full_name || 'Student'}
                          />
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
