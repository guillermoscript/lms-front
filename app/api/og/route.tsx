import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getSchoolBrand } from '@/lib/themes/school-brand'
import { readHeadingFont } from '@/lib/themes/brand-fonts'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchImageAsDataUrl } from '@/lib/og/fetch-image'
import { ogCardPalette, type OgCardPalette } from '@/lib/og/palette'
import type { KitHeadingFont } from '@/lib/themes/brand-outputs'

export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630

// s-maxage lowered from 24h (a school's brand change now reaches shared links
// within an hour, matching max-age) — issue #765.
const CACHE_HEADERS = {
  'cache-control': 'public, max-age=3600, s-maxage=3600',
}

// The verified-credential badge is a status colour (D4), never the brand — it
// means the same thing on every tenant's certificate.
const VERIFIED_GREEN = '#22c55e'
const VERIFIED_CHECK_INK = '#052e16'

function clamp(value: string | null, max: number): string {
  if (!value) return ''
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

/** `Buffer` -> `ArrayBuffer` for satori's `fonts[].data`, without sharing Node's buffer pool. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

type SatoriFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }

/** The theme's heading face at both weights satori needs, or `undefined` to keep its built-in default. */
async function loadHeadingFonts(family: KitHeadingFont | null): Promise<SatoriFont[] | undefined> {
  if (!family) return undefined
  const [bold, regular] = await Promise.all([readHeadingFont(family, 700), readHeadingFont(family, 400)])
  const fonts: SatoriFont[] = []
  if (bold) fonts.push({ name: family, data: toArrayBuffer(bold), weight: 700, style: 'normal' })
  if (regular) fonts.push({ name: family, data: toArrayBuffer(regular), weight: 400, style: 'normal' })
  return fonts.length ? fonts : undefined
}

/** The school's logo (if any) beside a name/issuer label — shared by every card variant. */
function BrandRow({
  logo,
  label,
  textColor,
}: {
  logo: string | null
  label: string
  textColor: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori renders its own <img>, not the DOM's
        <img src={logo} alt="" height={48} style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
      ) : null}
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: textColor }}>{label}</div>
    </div>
  )
}

function AccentBar({ color }: { color: string }) {
  return (
    <div
      style={{ display: 'flex', width: 220, height: 8, borderRadius: 9999, background: color }}
    />
  )
}

function cardBackground(palette: OgCardPalette): string {
  return `linear-gradient(135deg, ${palette.gradientFrom} 0%, ${palette.gradientTo} 100%)`
}

/**
 * `{ fontFamily: undefined }` is not the same as omitting the key: satori
 * copies style objects onto its computed style verbatim, so an explicit
 * `undefined` clobbers the `sans-serif` inherited from the card root instead
 * of falling through to it — and its font resolver then calls `.split(',')`
 * on that `undefined` and crashes. Spread this instead of setting the key
 * directly whenever the heading font may be absent.
 */
function headingFontStyle(family: string | undefined): { fontFamily: string } | Record<string, never> {
  return family ? { fontFamily: family } : {}
}

function renderGenericCard({
  site,
  title,
  subtitle,
  badge,
  logo,
  palette,
  headingFontFamily,
}: {
  site: string
  title: string
  subtitle: string
  badge: string
  logo: string | null
  palette: OgCardPalette
  headingFontFamily?: string
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: cardBackground(palette),
        color: palette.primaryText,
        fontFamily: 'sans-serif',
      }}
    >
      <BrandRow logo={logo} label={site} textColor={palette.secondaryText} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {badge ? (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: palette.secondaryText,
              border: `1px solid ${palette.accent}`,
              borderRadius: 9999,
              padding: '10px 26px',
            }}
          >
            {badge}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 60 ? 56 : 72,
            fontWeight: 700,
            lineHeight: 1.08,
            color: palette.primaryText,
            ...headingFontStyle(headingFontFamily),
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ display: 'flex', fontSize: 32, color: palette.secondaryText, lineHeight: 1.35 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <AccentBar color={palette.accent} />
    </div>
  )
}

function renderCertificateCard({
  issuer,
  student,
  course,
  eyebrow,
  verifiedLabel,
  logo,
  palette,
  headingFontFamily,
}: {
  issuer: string
  student: string
  course: string
  eyebrow: string
  verifiedLabel: string
  logo: string | null
  palette: OgCardPalette
  headingFontFamily?: string
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: cardBackground(palette),
        color: palette.primaryText,
        fontFamily: 'sans-serif',
      }}
    >
      <BrandRow logo={logo} label={issuer} textColor={palette.secondaryText} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: palette.secondaryText,
            border: `1px solid ${palette.accent}`,
            borderRadius: 9999,
            padding: '10px 26px',
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            color: palette.primaryText,
            ...headingFontStyle(headingFontFamily),
          }}
        >
          {student}
        </div>
        <div style={{ display: 'flex', fontSize: 36, color: palette.secondaryText, lineHeight: 1.3 }}>
          {course}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 9999,
              background: VERIFIED_GREEN,
            }}
          >
            {/* Inline SVG — the embedded OG font has no glyph for "✓" */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6L9 17l-5-5"
                stroke={VERIFIED_CHECK_INK}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: palette.secondaryText }}>{verifiedLabel}</div>
        </div>
        <AccentBar color={palette.accent} />
      </div>
    </div>
  )
}

function renderCourseCard({
  site,
  title,
  badge,
  thumbnail,
  logo,
  palette,
  headingFontFamily,
}: {
  site: string
  title: string
  badge: string
  thumbnail: string
  logo: string | null
  palette: OgCardPalette
  headingFontFamily?: string
}) {
  const panel = (
    <div
      style={{
        width: '50%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: cardBackground(palette),
        color: palette.primaryText,
        fontFamily: 'sans-serif',
      }}
    >
      <BrandRow logo={logo} label={site} textColor={palette.secondaryText} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {badge ? (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              fontSize: 20,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: palette.secondaryText,
              border: `1px solid ${palette.accent}`,
              borderRadius: 9999,
              padding: '8px 22px',
            }}
          >
            {badge}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 60 ? 44 : 56,
            fontWeight: 700,
            lineHeight: 1.12,
            color: palette.primaryText,
            ...headingFontStyle(headingFontFamily),
          }}
        >
          {title}
        </div>
      </div>
      <AccentBar color={palette.accent} />
    </div>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- satori renders its own <img>, not the DOM's */}
      <img
        src={thumbnail}
        alt=""
        width={WIDTH / 2}
        height={HEIGHT}
        style={{ width: '50%', height: '100%', objectFit: 'cover' }}
      />
      {panel}
    </div>
  )
}

/**
 * Dynamic Open Graph card generator (issue #765: branded per school).
 *
 * Variants (via ?type=):
 *  - generic (default): site + title + subtitle — used by most public pages
 *  - certificate: student achievement card — used by /verify/[code]
 *  - course: thumbnail + brand panel (logo, school name, badge, course title),
 *    or the generic layout with the course description when there is no
 *    thumbnail — used by /courses/[id]; falls back to the generic card when the course id
 *    does not resolve to a published course in the current tenant.
 *
 * All text params arrive already localized from generateMetadata callers.
 * Colours and the heading font come from `getSchoolBrand()` for the tenant
 * resolved from `x-tenant-id` (proxy.ts) — never from a query param.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const type = sp.get('type') ?? 'generic'

  const tenantId = await getCurrentTenantId()
  const brand = await getSchoolBrand(tenantId)
  const palette = ogCardPalette(brand.outputs)
  const headingFontFamily = brand.outputs.headingFont ?? undefined

  const [fonts, logo] = await Promise.all([
    loadHeadingFonts(brand.outputs.headingFont),
    brand.logoUrl ? fetchImageAsDataUrl(brand.logoUrl) : Promise.resolve(null),
  ])

  // A real school's name always wins; `site` is only the fallback for a
  // missing/unresolvable tenant (or a caller on a route with no tenant yet).
  const site = brand.name || clamp(sp.get('site'), 60) || 'LMS Platform'

  if (type === 'course') {
    const courseId = Number(sp.get('courseId'))
    const { data: course } = Number.isFinite(courseId)
      ? await createAdminClient()
          .from('courses')
          .select('title, description, thumbnail_url')
          .eq('course_id', courseId)
          .eq('tenant_id', tenantId)
          .eq('status', 'published')
          .maybeSingle()
      : { data: null }

    if (course) {
      // A caller's own title wins. The free-lesson pages reuse this variant to
      // borrow the course's thumbnail and brand panel (#799), but the card has
      // to name the lesson someone is being handed, not the course it sits in;
      // /courses/[id] passes the course's own title here, so it is unaffected.
      const title = clamp(sp.get('title'), 110) || clamp(course.title, 110) || site
      const badge = clamp(sp.get('badge'), 40)
      const thumbnail = course.thumbnail_url ? await fetchImageAsDataUrl(course.thumbnail_url) : null
      // Without a thumbnail the half-width panel wastes the card, so the
      // course reads like the generic card, description included.
      const card = thumbnail
        ? renderCourseCard({ site, title, badge, thumbnail, logo, palette, headingFontFamily })
        : renderGenericCard({ site, title, subtitle: clamp(sp.get('subtitle'), 180) || clamp(course.description, 180), badge, logo, palette, headingFontFamily })
      return new ImageResponse(card, { width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS, fonts })
    }
    // Unresolved course id (deleted, unpublished, wrong tenant) — the generic
    // card below still carries this tenant's brand.
  }

  if (type === 'certificate') {
    const student = clamp(sp.get('student'), 60) || 'Student'
    const course = clamp(sp.get('course'), 90) || 'Course'
    const issuer = clamp(sp.get('issuer'), 60) || site
    const eyebrow = clamp(sp.get('eyebrow'), 60) || 'Certificate of Completion'
    const verifiedLabel = clamp(sp.get('verifiedLabel'), 40) || 'Verified credential'

    return new ImageResponse(
      renderCertificateCard({ issuer, student, course, eyebrow, verifiedLabel, logo, palette, headingFontFamily }),
      { width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS, fonts }
    )
  }

  // Generic card
  const title = clamp(sp.get('title'), 110) || site
  const subtitle = clamp(sp.get('subtitle'), 180)
  const badge = clamp(sp.get('badge'), 40)

  return new ImageResponse(
    renderGenericCard({ site, title, subtitle, badge, logo, palette, headingFontFamily }),
    { width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS, fonts }
  )
}
