import type { ComponentProps } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { Button } from '@/components/ui/button'
import { IconCertificate, IconBook2, IconTrophy, IconAward } from '@tabler/icons-react'
import Link from 'next/link'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { CertificatesExplorer } from '@/components/student/certificates-explorer'

export default async function StudentCertificatesPage() {
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.student.certificates')

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Fetch certificates with related course and template data
  const { data: certificates } = await supabase
    .from('certificates')
    .select(`
      *,
      courses (
        course_id,
        title
      ),
      certificate_templates (
        template_id,
        template_name,
        design_settings,
        issuer_name,
        signature_name,
        signature_title
      )
    `)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .order('issued_at', { ascending: false })

  // Get unique courses with certificates for stats
  const uniqueCourses = new Set(certificates?.map(c => c.course_id) || [])

  return (
    <PageShell variant="wide" data-testid="certificates-page">
      <PageHeader
        title={<span data-testid="certificates-title">{t('title')}</span>}
        description={
          certificates && certificates.length > 0
            ? t('earned', { count: certificates.length })
            : t('subtitle')
        }
        actions={
          <Link href="/dashboard/student/courses">
            <Button variant="outline" size="sm" className="gap-1.5">
              <IconBook2 size={14} />
              {t('myCourses')}
            </Button>
          </Link>
        }
      />

      {/* Stats Row */}
      {certificates && certificates.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-1.5 rounded-lg bg-brand-tint text-brand-text">
                <IconAward size={14} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('statsTotal')}</span>
            </div>
            <p className="text-2xl font-black tabular-nums">{certificates.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-1.5 rounded-lg bg-brand-tint text-brand-text">
                <IconBook2 size={14} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('statsCourses')}</span>
            </div>
            <p className="text-2xl font-black tabular-nums">{uniqueCourses.size}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-1.5 rounded-lg bg-brand-tint text-brand-text">
                <IconTrophy size={14} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('statsLatest')}</span>
            </div>
            <p className="text-sm font-bold truncate">
              {certificates[0]?.courses?.title || '-'}
            </p>
          </div>
        </div>
      )}

      {/* Certificates List */}
      {!certificates || certificates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/15 p-16 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-tint flex items-center justify-center mb-5">
            <IconCertificate className="w-7 h-7 text-brand-text" />
          </div>
          <h3 className="text-lg font-bold mb-2">{t('noCertificates')}</h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
            {t('noCertificatesDescription')}
          </p>
          <Link href="/dashboard/student/browse">
            <Button>{t('browseCourses')}</Button>
          </Link>
        </div>
      ) : (
        <CertificatesExplorer certificates={certificates as unknown as ComponentProps<typeof CertificatesExplorer>["certificates"]} />
      )}
    </PageShell>
  )
}
