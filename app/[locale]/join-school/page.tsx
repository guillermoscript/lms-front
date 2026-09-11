import { createClient } from '@/lib/supabase/server'
import {getCurrentTenantId, getCurrentTenant, getCurrentUserId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { JoinSchoolForm } from '@/components/join-school-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, School } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { buildPageMetadata } from '@/lib/seo'
import { getSafeNextPath } from '@/lib/auth/safe-next-path'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return buildPageMetadata({ title: t('joinSchool.title'), description: t('joinSchool.description'), path: '/join-school', locale })
}

export default async function JoinSchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  // The three inputs are independent — resolve them together, not as a
  // waterfall of awaits.
  const [{ next: requestedNext }, supabase, userId, t] = await Promise.all([
    searchParams,
    createClient(),
    getCurrentUserId(),
    getTranslations('joinSchool'),
  ])
  // Where to go once the visitor is a member (#684). proxy.ts sets `next` when
  // it bounces a non-member off a protected page such as /checkout; a missing
  // or unsafe value falls back to the dashboard, never off-origin. Resolved
  // once here so the form and the member card share a single destination.
  const nextPath = getSafeNextPath(
    Array.isArray(requestedNext) ? requestedNext[0] : requestedNext,
    ''
  )
  const destination = nextPath || '/dashboard/student'

  // Redirect to login if not authenticated, keeping the intent through login
  if (!userId) {
    const returnTo = nextPath ? `/join-school?next=${encodeURIComponent(nextPath)}` : '/join-school'
    redirect(`/auth/login?next=${encodeURIComponent(returnTo)}`)
  }

  const tenantId = await getCurrentTenantId()
  const tenant = await getCurrentTenant()

  if (!tenant) {
    return (
      <div className="container mx-auto py-12 max-w-md">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">{t('notFoundTitle')}</CardTitle>
            <CardDescription className="text-red-700">{t('notFoundDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline">{t('returnHome')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if user is already a member of this tenant. Only an ACTIVE row
  // counts (#550): a member removed by an admin keeps their row with
  // `status = 'removed'`, and gating on mere existence would show them
  // "You're Already a Member!" on the very page they were redirected to in
  // order to re-join, with no way forward. `joinCurrentSchool()` applies the
  // same rule and reinstates the row through the normal student-limit check.
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  if (membership) {
    return (
      <div className="container mx-auto py-12 max-w-md">
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <CardTitle className="text-green-900">{t('memberTitle')}</CardTitle>
            </div>
            <CardDescription className="text-green-700">
              {t('memberDescription', { school: tenant.name })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-green-800">
              {t('memberBody', { school: tenant.name })}
            </p>
            <div className="flex gap-2">
              <Link href={destination} className="flex-1">
                <Button className="w-full">
                  {nextPath ? t('continue') : t('goToDashboard')}
                </Button>
              </Link>
              <Link href="/dashboard/student/browse" className="flex-1">
                <Button variant="outline" className="w-full">{t('browseCourses')}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Get user's other school memberships — active ones only, for the same
  // reason as above: a school the user was removed from is not somewhere they
  // can still switch back into.
  const { data: otherMemberships } = await supabase
    .from('tenant_users')
    .select('tenant_id, tenants(name, slug)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .neq('tenant_id', tenantId)

  return (
    <div className="container mx-auto py-12 max-w-2xl">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <School className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-2" data-testid="join-school-title">
          {t('title', { school: tenant.name })}
        </h1>
        <p className="text-muted-foreground">{t('subtitle', { school: tenant.name })}</p>
      </div>

      {otherMemberships && otherMemberships.length > 0 && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-sm text-blue-900">{t('otherSchoolsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {otherMemberships.map((membership) => {
                // The generated types model this to-one embed as an array while
                // PostgREST returns a bare object; the `any` this replaces was
                // hiding the mismatch rather than resolving it. Handle both so
                // the row renders whichever shape actually arrives.
                const school = Array.isArray(membership.tenants)
                  ? membership.tenants[0]
                  : membership.tenants
                return (
                  <li key={membership.tenant_id} className="text-sm text-blue-800">
                    • {school?.name || t('unknownSchool')}
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-blue-700 mt-3">{t('otherSchoolsHint')}</p>
          </CardContent>
        </Card>
      )}

      <JoinSchoolForm tenant={tenant} destination={destination} />
    </div>
  )
}
