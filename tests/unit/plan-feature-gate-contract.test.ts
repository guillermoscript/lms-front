import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FEATURE_REQUIRED_PLAN, PLAN_FEATURE_LABELS } from '@/lib/plans/features'

/**
 * Issue #662 — a feature cannot be sold without being enforced.
 *
 * Every key in `FEATURE_REQUIRED_PLAN` (the pricing promise) must have a
 * server-side gate: a `requirePlanFeature('<key>')` / `hasPlanFeature('<key>')`
 * / tier helper call in `app/`, `lib/` or `components/`, or an entry in the allowlist below
 * that names where else it is enforced. Adding a key to the map without a
 * gate fails this test, which is the point.
 */

/** Keys enforced somewhere other than lib/plans/server.ts. */
const ENFORCED_ELSEWHERE: Record<string, string> = {
  leaderboard: 'get_gamification_features RPC in supabase/functions/get-leaderboard',
  achievements: 'get_gamification_features RPC in supabase/functions/check-achievements',
  store: 'get_gamification_features RPC in supabase/functions/spend-points',
  community: 'features.community check on every community page (app/[locale]/dashboard/*/community)',
  priority_support: 'not a product capability — support SLA',
  voice_exercises: 'no voice surface ships yet; gate at build time (tracked in #662)',
  white_label: 'no white-label surface ships yet; gate at build time (tracked in #662)',
}

const TIER_HELPERS: Record<string, string[]> = {
  analytics: ['getAnalyticsTier(', 'analyticsTierOf('],
  certificates: ['getCertificateTier(', 'certificateTierOf('],
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const root = process.cwd()
const sources = [...walk(join(root, 'app')), ...walk(join(root, 'lib')), ...walk(join(root, 'components'))]
  .filter((f) => !f.endsWith('lib/plans/server.ts') && !f.endsWith('lib/plans/features.ts'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

function hasServerGate(key: string): boolean {
  // Allow one level of nested parentheses before the key, e.g.
  // hasPlanFeature(await getCurrentTenantId(), 'ai_grading').
  const direct = ['requirePlanFeature', 'hasPlanFeature'].some((fn) =>
    new RegExp(`${fn}\\((?:[^()]|\\([^()]*\\))*['"]${key}['"]`).test(sources)
  )
  const tiered = (TIER_HELPERS[key] ?? []).some((fn) => sources.includes(fn))
  return direct || tiered
}

describe('plan feature gate contract (#662)', () => {
  for (const key of Object.keys(FEATURE_REQUIRED_PLAN)) {
    it(`"${key}" is enforced server-side`, () => {
      if (key in ENFORCED_ELSEWHERE) return
      expect(hasServerGate(key), `no requirePlanFeature/hasPlanFeature('${key}') in app/ or lib/`).toBe(true)
    })
  }

  it('api_access is no longer a plan promise (MCP is open on every plan)', () => {
    expect(FEATURE_REQUIRED_PLAN).not.toHaveProperty('api_access')
    expect(PLAN_FEATURE_LABELS).not.toHaveProperty('api_access')
  })

  it('every promised key has a comparison-table label', () => {
    for (const key of Object.keys(FEATURE_REQUIRED_PLAN)) {
      expect(PLAN_FEATURE_LABELS, key).toHaveProperty(key)
    }
  })
})
