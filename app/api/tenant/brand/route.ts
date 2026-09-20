/**
 * Public school brand — `GET /api/tenant/brand[?slug=]`
 *
 * The theme kit keeps a school's brand in `tenant_settings.theme_preset`, and
 * that table is admin-only under RLS. The web never notices: the root layout
 * resolves the theme server-side and writes CSS variables. A native client has
 * no such layout, so without this route every school looks unbranded in the
 * app (#818, guillermoscript/lms-app#6).
 *
 * Public by design. These are the colours, the name and the logo any visitor
 * already sees on the school's own site, and the caller that needs them most —
 * a school picker re-skinning before sign-in — has no session to authenticate
 * with. No setting, count or address is exposed.
 *
 * It answers with the *derived literals* from `deriveBrandOutputs`, not the
 * stored theme: the contrast work (`readableButton`, `accentTextOn`, OKLCH
 * mixing) stays here, where it is already written and already tested, instead
 * of being re-implemented per client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getSchoolBrand } from '@/lib/themes/school-brand'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug')?.trim().toLowerCase()

    // No slug: the subdomain already told proxy.ts which school this is. Both
    // paths read the row, so `slug` in the answer is always the school's own —
    // never null on a subdomain, never the caller's spelling of it.
    const tenants = createAdminClient().from('tenants').select('id, slug')
    const { data: tenant } = await (slug
      ? tenants.eq('slug', slug)
      : tenants.eq('id', await getCurrentTenantId())
    ).maybeSingle()
    if (!tenant) return new NextResponse('School not found', { status: 404 })

    const tenantId: string = tenant.id
    const tenantSlug: string = tenant.slug

    const brand = await getSchoolBrand(tenantId)
    const { outputs } = brand

    return NextResponse.json(
      {
        tenantId: brand.tenantId,
        slug: tenantSlug,
        name: brand.name,
        logoUrl: brand.logoUrl,
        // null = this school renders on the platform palette.
        themeId: outputs.themeId,
        colors: {
          brand: outputs.brand,
          button: outputs.button,
          buttonInk: outputs.buttonInk,
          buttonBorder: outputs.buttonBorder,
          brandText: outputs.brandText,
          tint: outputs.tint,
          deep: outputs.deep,
          deepInk: outputs.deepInk,
          paper: outputs.paper,
        },
      },
      {
        headers: {
          // A brand changes when an admin saves the picker, not per request.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    )
  } catch (error) {
    console.error('[tenant-brand] failed', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
