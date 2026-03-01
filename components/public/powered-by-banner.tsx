import { getCurrentTenant } from '@/lib/supabase/tenant'
import { getTranslations } from 'next-intl/server'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const FREE_STARTER_PLANS = ['free', 'starter']

export async function PoweredByBanner() {
  const tenant = await getCurrentTenant()
  const t = await getTranslations('landingPageBuilder.poweredBy')

  // Don't show on main platform or if no tenant
  if (!tenant || tenant.id === DEFAULT_TENANT_ID) return null

  // Only show for free/starter plans
  if (!FREE_STARTER_PLANS.includes(tenant.plan)) return null

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'
  const platformUrl = platformDomain.includes('localhost') || platformDomain.includes('lvh.me')
    ? `http://${platformDomain}`
    : `https://${platformDomain}`

  return (
    <div className="border-t border-white/5 bg-[#0A0A0A] py-2.5">
      <div className="container mx-auto px-4 text-center">
        <p className="text-xs text-zinc-500">
          {t('text')}{' '}
          <a
            href={platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white transition-colors underline underline-offset-2"
          >
            {t('brandName')}
          </a>
          {' '}&mdash;{' '}
          <a
            href={`${platformUrl}/create-school`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white transition-colors underline underline-offset-2"
          >
            {t('createSchool')}
          </a>
        </p>
      </div>
    </div>
  )
}
