import { getCurrentTenant } from '@/lib/supabase/tenant'
import { getTranslations } from 'next-intl/server'
import { hasPlanFeature } from '@/lib/plans/server'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function PoweredByBanner() {
  const tenant = await getCurrentTenant()
  const t = await getTranslations('landingPageBuilder.poweredBy')

  // Don't show on main platform or if no tenant
  if (!tenant || tenant.id === DEFAULT_TENANT_ID) return null

  // `remove_branding` is the plan feature that hides this (#662) — read from
  // platform_plans like every other gate, not from a hardcoded plan list.
  if (await hasPlanFeature(tenant.id, 'remove_branding')) return null

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'
  const platformUrl = platformDomain.includes('localhost') || platformDomain.includes('lvh.me')
    ? `http://${platformDomain}`
    : `https://${platformDomain}`

  return (
    <div className="border-t border-border bg-muted/30 py-2.5">
      <div className="container mx-auto px-4 text-center">
        <p className="text-xs text-muted-foreground">
          {t('text')}{' '}
          <a
            href={platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {t('brandName')}
          </a>
          {' '}&mdash;{' '}
          <a
            href={`${platformUrl}/create-school`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            {t('createSchool')}
          </a>
        </p>
      </div>
    </div>
  )
}
