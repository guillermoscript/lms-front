import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { IconArrowLeft } from '@tabler/icons-react'
import { PlanForm } from '@/components/admin/plan-form'

interface PageProps {
  params: Promise<{ planId: string }>
}

export default async function EditPlanPage({ params }: PageProps) {
  const { planId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch plan with courses
  const { data: plan, error } = await supabase
    .from('plans')
    .select(`
      *,
      plan_courses (
        course_id
      )
    `)
    .eq('plan_id', parseInt(planId))
    .is('deleted_at', null)
    .single()

  if (error || !plan) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin/plans">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              Back to Plans
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Edit Subscription Plan</h1>
            <p className="mt-1 text-muted-foreground">
              Update plan details and recurring billing configuration
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>{plan.plan_name}</CardTitle>
            <CardDescription>
              Changes to price, currency, or duration will create a new Stripe price.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanForm mode="edit" initialData={plan} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
