import { createAdminClient } from '@/lib/supabase/admin'
import { PlanComparisonTable } from '@/components/admin/plan-comparison-table'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function PlatformPricingPage() {
  const adminClient = await createAdminClient()

  const { data: plans } = await adminClient
    .from('platform_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Start free and scale as you grow. No hidden fees, no long-term contracts.
          Upgrade or downgrade anytime.
        </p>
      </div>

      {/* Plans */}
      <div className="mx-auto max-w-7xl px-4 pb-16">
        <PlanComparisonTable
          plans={plans || []}
          showActions={false}
        />
      </div>

      {/* CTA */}
      <div className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold">Ready to get started?</h2>
          <p className="mt-2 text-muted-foreground">
            Create your school for free and upgrade whenever you need more.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link href="/create-school">
              <Button size="lg">Create Your School</Button>
            </Link>
            <Link href="/auth/login">
              <Button size="lg" variant="outline">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
