import { redirect, notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { IconArrowLeft } from '@tabler/icons-react'
import { PlanForm } from '@/components/admin/plan-form'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ planId: string }>
}

export default async function EditPlanPage({ params }: PageProps) {
  const { planId } = await params
  const t = await getTranslations('dashboard.admin.plans.edit')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Fetch plan with courses and published courses in parallel
  const [{ data: plan, error }, { data: courses }] = await Promise.all([
    supabase
    .from('plans')
    .select(`
      *,
      plan_courses (
        course_id
      )
    `)
    .eq('plan_id', parseInt(planId))
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single(),
    supabase
      .from('courses')
      .select('course_id, title')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .order('title'),
  ])

  if (error || !plan) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tBreadcrumbs('plans'), href: '/dashboard/admin/plans' },
                { label: tBreadcrumbs('editPlan') },
              ]}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>{plan.plan_name}</CardTitle>
            <CardDescription>
              {t('description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanForm mode="edit" initialData={plan} courses={courses || []} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
