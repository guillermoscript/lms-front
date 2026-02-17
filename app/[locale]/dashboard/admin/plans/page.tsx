import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  IconArrowLeft,
  IconPlus,
  IconCalendar,
  IconEdit
} from '@tabler/icons-react'

export default async function AdminPlansPage() {
  const t = await getTranslations('dashboard.admin.plans')
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verify admin role
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/student')
  }

  // Get all plans with course counts
  const { data: plans } = await supabase
    .from('plans')
    .select(`
      *,
      plan_courses (
        course_id,
        course:courses (
          course_id,
          title
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const monthlyCount = plans?.filter(p => p.duration_in_days === 30).length || 0
  const yearlyCount = plans?.filter(p => p.duration_in_days === 365).length || 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              {t('back')}
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
              <p className="mt-1 text-muted-foreground">
                {t('description')}
              </p>
            </div>
            <Link href="/dashboard/admin/plans/new">
              <Button>
                <IconPlus className="mr-2 h-4 w-4" />
                {t('create')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-3xl font-bold">{plans?.length || 0}</p>
                </div>
                <IconCalendar className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.monthly')}</p>
                  <p className="mt-2 text-3xl font-bold">{monthlyCount}</p>
                </div>
                <IconCalendar className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.yearly')}</p>
                  <p className="mt-2 text-3xl font-bold">{yearlyCount}</p>
                </div>
                <IconCalendar className="h-10 w-10 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plans Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans && plans.length > 0 ? (
            plans.map((plan) => {
              const courseCount = plan.plan_courses?.length || 0
              const isMonthly = plan.duration_in_days === 30
              const features = plan.features ? plan.features.split(',').map((f: string) => f.trim()) : []

              return (
                <Card key={plan.plan_id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="line-clamp-2">{plan.plan_name}</CardTitle>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant={isMonthly ? 'default' : 'secondary'}>
                            {isMonthly ? t('card.monthly') : t('card.yearly')}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {courseCount} {courseCount === 1 ? t('card.course') : t('card.courses')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                      {plan.description || t('card.noDescription')}
                    </p>
                    <div className="mb-4">
                      <p className="text-2xl font-bold">
                        {plan.currency === 'usd' ? '$' : '€'}
                        {plan.price.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isMonthly ? t('card.perMonth') : t('card.perYear')}
                      </p>
                    </div>

                    {/* Features */}
                    {features.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {t('card.features')}
                        </p>
                        <ul className="space-y-1">
                          {features.slice(0, 3).map((feature: string, idx: number) => (
                            <li key={idx} className="text-xs text-muted-foreground truncate">
                              • {feature}
                            </li>
                          ))}
                          {features.length > 3 && (
                            <li className="text-xs text-muted-foreground">
                              • {t('card.more', { count: features.length - 3 })}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Course List */}
                    {plan.plan_courses && plan.plan_courses.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {t('card.includedCourses')}
                        </p>
                        <ul className="space-y-1">
                          {plan.plan_courses.slice(0, 3).map((pc: any) => (
                            <li key={pc.course_id} className="text-xs text-muted-foreground truncate">
                              • {pc.course?.title}
                            </li>
                          ))}
                          {plan.plan_courses.length > 3 && (
                            <li className="text-xs text-muted-foreground">
                              • {t('card.more', { count: plan.plan_courses.length - 3 })}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <Link href={`/dashboard/admin/plans/${plan.plan_id}/edit`} className="block">
                      <Button variant="outline" size="sm" className="w-full">
                        <IconEdit className="mr-1 h-4 w-4" />
                        {t('card.edit')}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )
            })
          ) : (
            <div className="col-span-full">
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <IconCalendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">{t('empty.title')}</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('empty.description')}
                  </p>
                  <Link href="/dashboard/admin/plans/new">
                    <Button>
                      <IconPlus className="mr-2 h-4 w-4" />
                      {t('create')}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
