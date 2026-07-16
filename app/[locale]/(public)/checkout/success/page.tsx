import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { IconCircleCheckFilled } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckoutProcessing } from '@/components/public/checkout-processing'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ transactionId?: string; type?: string }>
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { transactionId: transactionIdParam, type } = await searchParams
  const t = await getTranslations('checkout.success')
  const transactionId = Number(transactionIdParam)

  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
    return <SuccessCard primaryHref={type === 'plan' ? '/dashboard/student/browse' : '/dashboard/student/courses'} />
  }

  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/checkout/success?transactionId=${transactionId}`)}`)
  }

  const { data: transaction } = await supabase
    .from('transactions')
    .select('transaction_id, status, product_id, plan_id')
    .eq('transaction_id', transactionId)
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single()

  if (!transaction) {
    redirect('/dashboard/student')
  }

  if (transaction.status === 'pending') {
    return <CheckoutProcessing />
  }

  if (transaction.status !== 'successful') {
    redirect('/dashboard/student/billing')
  }

  if (transaction.plan_id) {
    redirect('/dashboard/student/browse?checkout=success')
  }

  if (!transaction.product_id) {
    redirect('/dashboard/student/courses')
  }

  const { data: productCourses } = await supabase
    .from('product_courses')
    .select('course_id, course:courses(title)')
    .eq('product_id', transaction.product_id)
    .eq('tenant_id', tenantId)
    .order('course_id')

  const courses = (productCourses ?? []).map(({ course_id, course }) => ({
    courseId: course_id,
    title: (course as unknown as { title: string } | null)?.title ?? t('courseFallback'),
  }))

  if (courses.length === 1) {
    redirect(`/dashboard/student/courses/${courses[0].courseId}`)
  }

  if (courses.length === 0) {
    redirect('/dashboard/student/courses')
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-16">
      <Card className="w-full border-border shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <SuccessIcon />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('multipleCourses')}</p>
          </div>
          <div className="flex w-full flex-col gap-3">
            {courses.map((course) => (
              <Link key={course.courseId} href={`/dashboard/student/courses/${course.courseId}`}>
                <Button variant="outline" className="w-full">{course.title}</Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

async function SuccessCard({ primaryHref }: { primaryHref: string }) {
  const t = await getTranslations('checkout.success')

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <SuccessIcon />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Link href={primaryHref} className="w-full">
            <Button className="w-full">{t('continue')}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function SuccessIcon() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
      <IconCircleCheckFilled className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
    </div>
  )
}
