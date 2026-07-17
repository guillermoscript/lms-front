/**
 * Build & publish the Free Academy "home" landing page from the live-data
 * widgets, and emit its puck_data JSON (for extraction into a reusable template).
 *
 * Each block's props = its real defaultProps (from the generated manifest) merged
 * with page-specific overrides + a stable id, so <Render> gets complete props
 * (Puck does not backfill top-level defaults). LOCAL-ONLY (guarded).
 *
 * Run: npx tsx --env-file=.env.local scripts/build-free-academy-page.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error(`Refusing: ${url} is not local.`)

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const TENANT_ID = '00000000-0000-0000-0000-000000000010'
const FREE_COURSE_ID = '10004'

const manifest = JSON.parse(readFileSync(resolve('lib/json-render/puck-fields.generated.json'), 'utf8'))
const defaults = (type: string): Record<string, unknown> => ({ ...(manifest[type]?.defaultProps ?? {}) })

// The page: [blockType, overrides]. Order = render order.
const BLOCKS: Array<[string, Record<string, unknown>]> = [
  ['Header', {
    logoText: 'Free Academy',
    navLinks: [
      { label: 'Free course', href: '/courses/' + FREE_COURSE_ID },
      { label: 'Catalog', href: '#catalog' },
      { label: 'Pricing', href: '#pricing' },
    ],
    ctaLabel: 'Start free',
    ctaHref: `/courses/${FREE_COURSE_ID}?enroll=1`,
  }],
  ['HeroBlock', {
    title: 'Learn freelancing — completely free',
    subtitle: 'Land your first client with our free, beginner-friendly course. No credit card, no catch — just enroll and start today.',
    primaryCtaLabel: 'Start the free course',
    primaryCtaHref: `/courses/${FREE_COURSE_ID}?enroll=1`,
    secondaryCtaLabel: 'Browse catalog',
    secondaryCtaHref: '#catalog',
    backgroundImage: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&q=80',
    overlayOpacity: 60,
    minHeight: '560px',
  }],
  ['StatsBand', { heading: 'Free Academy in numbers', subtitle: 'Real learners, real progress — updated live from our catalog.', useLiveStats: true }],
  ['CourseGrid', {
    title: 'Start with our free course',
    subtitle: 'Hand-picked to get you from zero to your first paid project.',
    courseIds: [{ id: FREE_COURSE_ID }],
    maxItems: 3,
    columns: '3',
  }],
  ['EnrollCta', {
    courseId: FREE_COURSE_ID,
    headline: 'Ready to go freelance?',
    subtext: 'Enroll in Intro to Freelancing right now — it is free, forever.',
    buttonLabel: 'Enroll free',
  }],
  ['CatalogBrowser', { title: 'Explore the full catalog', subtitle: 'Free and premium courses, all in one place.' }],
  ['TestimonialGrid', { title: 'What our learners say', subtitle: 'Straight from students who took the free course.' }],
  ['TeamGrid', { title: 'Meet your instructor', subtitle: 'Learn from someone who has done the work.' }],
  ['PricingTable', { title: 'Simple, honest pricing', subtitle: 'Start free. Upgrade only when you are ready.' }],
  ['CtaBanner', {
    heading: 'Your first client is one course away',
    subtitle: 'Join Free Academy today — the first course is on us.',
    primaryLabel: 'Start the free course',
    primaryHref: `/courses/${FREE_COURSE_ID}?enroll=1`,
    secondaryLabel: 'See all courses',
    secondaryHref: '#catalog',
  }],
  ['Footer', {
    description: 'Free Academy — practical skills for the independent professional. Start free, learn for life.',
    copyright: '© 2026 Free Academy. All rights reserved.',
  }],
]

const content = BLOCKS.map(([type, overrides], i) => ({
  type,
  props: { ...defaults(type), ...overrides, id: `${type}-${i + 1}` },
}))

const puckData = { root: { props: {} }, content, zones: {} }

async function main() {
  // Emit for template extraction.
  const out = resolve('scratchpad-free-academy-home.json')
  writeFileSync(out, JSON.stringify(puckData, null, 2))
  console.log('puck_data →', out, `(${content.length} blocks)`)

  // Upsert the published home page.
  const { data: existing } = await db
    .from('landing_pages')
    .select('page_id')
    .eq('tenant_id', TENANT_ID)
    .eq('slug', 'home')
    .maybeSingle()

  if (existing) {
    const { error } = await db
      .from('landing_pages')
      .update({ title: 'Home', puck_data: puckData, is_published: true, updated_at: new Date().toISOString() })
      .eq('page_id', existing.page_id)
    if (error) throw error
    console.log('updated + published landing_pages', existing.page_id)
  } else {
    const { data, error } = await db
      .from('landing_pages')
      .insert({ tenant_id: TENANT_ID, title: 'Home', slug: 'home', is_published: true, puck_data: puckData })
      .select('page_id')
      .single()
    if (error) throw error
    console.log('inserted + published landing_pages', data.page_id)
  }

  console.log('\n✅ Free Academy home page published → free-academy.lvh.me:3000/')
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
