import { CreateSchoolFlow } from '@/components/tenant/create-school-flow'
import { getSessionUser } from '@/lib/supabase/tenant'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { buildPageMetadata } from '@/lib/seo'
import { headers } from 'next/headers'
import { detectCountry } from '@/lib/countries'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return buildPageMetadata({ title: t('createSchool.title'), description: t('createSchool.description'), path: '/create-school', locale })
}

export default async function CreateSchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>
}) {
  const user = await getSessionUser()
  const { plan, interval } = await searchParams
  // Pre-selects the country picker from the edge geo header or Accept-Language
  // (#865). `null` when unknown — the picker then starts empty, never on a
  // hardcoded default.
  const initialCountry = detectCountry(await headers())

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <CreateSchoolFlow
          user={user ? { id: user.id, email: user.email || '' } : null}
          plan={plan}
          interval={interval === 'yearly' ? 'yearly' : interval === 'monthly' ? 'monthly' : undefined}
          initialCountry={initialCountry}
        />
      </div>
    </div>
  )
}
