/**
 * Seeds a published Puck landing page for the code-academy tenant so the
 * blocks touched by issue #764 surface 2 (Header, Section, Banner in every
 * style, SocialProof, TestimonialGrid) can be screenshotted.
 *
 * Props come from each block's own `defaultProps`, so the fixture never drifts
 * from the component contract.
 *
 * Usage: npx tsx scripts/qa-puck-landing-fixture.ts [create|drop]
 *
 * NOTE: a published landing page makes PublicLayout drop the shared
 * navbar/footer for EVERY public route of that tenant, so create it only for
 * the Puck pass and drop it afterwards.
 */

import { execFileSync } from 'node:child_process'
import { puckConfig } from '../lib/puck/config'

const TENANT_ID = '00000000-0000-0000-0000-000000000002'
const DB_CONTAINER = 'supabase_db_lms-front'
const SLUG = 'qa-764'

function psql(sql: string): string {
  return execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
  })
}

function defaults(type: string): Record<string, unknown> {
  const cfg = (puckConfig.components as Record<string, { defaultProps?: Record<string, unknown> }>)[type]
  if (!cfg) throw new Error(`no Puck component named ${type}`)
  return { ...(cfg.defaultProps ?? {}) }
}

function node(type: string, overrides: Record<string, unknown> = {}, idSuffix = '') {
  return { type, props: { id: `${type}-qa764${idSuffix}`, ...defaults(type), ...overrides } }
}

function build() {
  const content = [
    node('Header'),
    node('Section', { }),
    node('Banner', { style: 'brand', text: 'Brand banner — uses the block accent' }, '-brand'),
    node('Banner', { style: 'info', text: 'Info banner — enrollment is open' }, '-info'),
    node('Banner', { style: 'success', text: 'Success banner — your seat is confirmed' }, '-success'),
    node('Banner', { style: 'warning', text: 'Warning banner — early-bird pricing ends soon' }, '-warning'),
    node('Banner', { style: 'urgent', text: 'Urgent banner — last two places left' }, '-urgent'),
    node('SocialProof'),
    node('TestimonialGrid'),
  ]
  return { root: { props: {} }, content, zones: {} }
}

function main() {
  const action = process.argv[2] ?? 'create'
  if (action === 'drop') {
    psql(`DELETE FROM landing_pages WHERE tenant_id='${TENANT_ID}' AND slug='${SLUG}'`)
    console.log(`[puck-fixture] dropped ${SLUG}`)
    return
  }

  const data = JSON.stringify(build()).replace(/'/g, "''")
  psql(`
    INSERT INTO landing_pages (tenant_id, title, slug, is_published, puck_data)
    VALUES ('${TENANT_ID}', 'QA 764 blocks', '${SLUG}', true, '${data}'::jsonb)
    ON CONFLICT (tenant_id, slug) DO UPDATE SET puck_data = EXCLUDED.puck_data, is_published = true`)
  console.log(`[puck-fixture] published /${SLUG} with ${build().content.length} blocks`)
}

main()
