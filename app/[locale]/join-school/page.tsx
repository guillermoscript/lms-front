import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getCurrentTenant } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { JoinSchoolForm } from '@/components/join-school-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, School } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function JoinSchoolPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/auth/login?next=/join-school')
  }

  const tenantId = await getCurrentTenantId()
  const tenant = await getCurrentTenant()

  if (!tenant) {
    return (
      <div className="container mx-auto py-12 max-w-md">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">School Not Found</CardTitle>
            <CardDescription className="text-red-700">
              The school you're trying to join doesn't exist or is no longer available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline">Return to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if user is already a member of this tenant
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single()

  if (membership) {
    return (
      <div className="container mx-auto py-12 max-w-md">
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <CardTitle className="text-green-900">You're Already a Member!</CardTitle>
            </div>
            <CardDescription className="text-green-700">
              You're already enrolled in {tenant.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-green-800">
              You have access to all courses and resources at {tenant.name}.
            </p>
            <div className="flex gap-2">
              <Link href="/dashboard/student" className="flex-1">
                <Button className="w-full">Go to Dashboard</Button>
              </Link>
              <Link href="/dashboard/student/browse" className="flex-1">
                <Button variant="outline" className="w-full">Browse Courses</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Get user's other school memberships
  const { data: otherMemberships } = await supabase
    .from('tenant_users')
    .select('tenant_id, tenants(name, slug)')
    .eq('user_id', user.id)
    .neq('tenant_id', tenantId)

  return (
    <div className="container mx-auto py-12 max-w-2xl">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <School className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-2" data-testid="join-school-title">Join {tenant.name}</h1>
        <p className="text-muted-foreground">
          Start learning with {tenant.name} today
        </p>
      </div>

      {otherMemberships && otherMemberships.length > 0 && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-sm text-blue-900">
              You're already a member of:
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {otherMemberships.map((membership: any) => (
                <li key={membership.tenant_id} className="text-sm text-blue-800">
                  • {membership.tenants?.name || 'Unknown School'}
                </li>
              ))}
            </ul>
            <p className="text-xs text-blue-700 mt-3">
              You can switch between schools anytime from your dashboard.
            </p>
          </CardContent>
        </Card>
      )}

      <JoinSchoolForm tenant={tenant} />
    </div>
  )
}
