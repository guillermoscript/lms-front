import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630

const CACHE_HEADERS = {
  'cache-control': 'public, max-age=3600, s-maxage=86400',
}

function clamp(value: string | null, max: number): string {
  if (!value) return ''
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

/**
 * Dynamic Open Graph card generator.
 *
 * Variants (via ?type=):
 *  - generic (default): site + title + subtitle — used by most public pages
 *  - certificate: student achievement card — used by /verify/[code]
 *
 * All text params arrive already localized from generateMetadata callers.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const type = sp.get('type') ?? 'generic'
  const site = clamp(sp.get('site'), 60) || 'LMS Platform'

  if (type === 'certificate') {
    const student = clamp(sp.get('student'), 60) || 'Student'
    const course = clamp(sp.get('course'), 90) || 'Course'
    const issuer = clamp(sp.get('issuer'), 60) || site
    const eyebrow = clamp(sp.get('eyebrow'), 60) || 'Certificate of Completion'
    const verifiedLabel = clamp(sp.get('verifiedLabel'), 40) || 'Verified credential'

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 72,
            background: 'linear-gradient(135deg, #120b24 0%, #241245 55%, #120b24 100%)',
            color: '#f5f3ff',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Top: issuer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 9999,
                background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
              }}
            />
            <div style={{ fontSize: 30, fontWeight: 600, color: '#ddd6fe' }}>{issuer}</div>
          </div>

          {/* Middle: achievement */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                fontSize: 22,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: '#c4b5fd',
                border: '1px solid rgba(167, 139, 250, 0.45)',
                borderRadius: 9999,
                padding: '10px 26px',
              }}
            >
              {eyebrow}
            </div>
            <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
              {student}
            </div>
            <div style={{ display: 'flex', fontSize: 36, color: '#c4b5fd', lineHeight: 1.3 }}>
              {course}
            </div>
          </div>

          {/* Bottom: verification strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 9999,
                  background: '#22c55e',
                }}
              >
                {/* Inline SVG — the embedded OG font has no glyph for "✓" */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="#052e16"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div style={{ fontSize: 28, color: '#bbf7d0' }}>{verifiedLabel}</div>
            </div>
            <div
              style={{
                display: 'flex',
                width: 220,
                height: 8,
                borderRadius: 9999,
                background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
              }}
            />
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS }
    )
  }

  // Generic card
  const title = clamp(sp.get('title'), 110) || site
  const subtitle = clamp(sp.get('subtitle'), 180)
  const badge = clamp(sp.get('badge'), 40)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #0e0a1c 0%, #1e1038 55%, #0e0a1c 100%)',
          color: '#f5f3ff',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top: site */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 9999,
              background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
            }}
          />
          <div style={{ fontSize: 30, fontWeight: 600, color: '#ddd6fe' }}>{site}</div>
        </div>

        {/* Middle: title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {badge ? (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                fontSize: 22,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: '#c4b5fd',
                border: '1px solid rgba(167, 139, 250, 0.45)',
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
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: 'flex', fontSize: 32, color: '#c4b5fd', lineHeight: 1.35 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* Bottom: accent bar */}
        <div
          style={{
            display: 'flex',
            width: 220,
            height: 8,
            borderRadius: 9999,
            background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
          }}
        />
      </div>
    ),
    { width: WIDTH, height: HEIGHT, headers: CACHE_HEADERS }
  )
}
