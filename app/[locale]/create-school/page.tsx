import { CreateSchoolFlow } from '@/components/tenant/create-school-flow'
import { getSessionUser } from '@/lib/supabase/tenant'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return buildPageMetadata({ title: t('createSchool.title'), description: t('createSchool.description'), path: '/create-school', locale })
}

export default async function CreateSchoolPage() {
  const user = await getSessionUser()

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <CreateSchoolFlow
          user={user ? { id: user.id, email: user.email || '' } : null}
        />
      </div>
    </div>
  )
}
