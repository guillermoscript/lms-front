/**
 * Proof of the json-render → Puck pipeline.
 *
 * Run: npx tsx scripts/json-render-proof.ts
 *
 * Demonstrates, end to end and without an LLM key:
 *   1. The catalog produces an AI system prompt constrained to our landing blocks.
 *   2. A spec (the kind an AI would emit) validates against the catalog.
 *   3. The spec converts cleanly into Puck `Data` — ready to open in the Puck editor.
 */
import { landingCatalog } from '../lib/json-render/catalog'
import { specToPuckData, normalizeSpec, type JsonRenderSpec } from '../lib/json-render/to-puck'

// 1) The system prompt an LLM would receive. Constrains it to ONLY our blocks.
const systemPrompt = landingCatalog.prompt()
console.log('=== 1. AI SYSTEM PROMPT (truncated) ===')
console.log(systemPrompt.slice(0, 600) + '\n...[truncated]\n')

// 2) A sample spec — exactly what the AI would generate for:
//    "Landing page for a beginner Spanish course: hero, stats, closing CTA"
const aiSpec: JsonRenderSpec = {
  root: 'page',
  elements: {
    page: { type: 'HeroBlock', children: ['hero', 'stats', 'cta'], props: {} },
    hero: {
      type: 'HeroBlock',
      props: {
        title: 'Learn Spanish from zero — at your pace',
        subtitle: 'Bite-sized lessons, real conversations, and a certificate when you finish.',
        primaryCtaLabel: 'Start free',
        primaryCtaHref: '/auth/sign-up',
        secondaryCtaLabel: 'See the syllabus',
        secondaryCtaHref: '/courses',
        alignment: 'center',
      },
    },
    stats: {
      type: 'StatsBand',
      props: {
        heading: 'Join thousands of learners',
        subtitle: null,
        items: [
          { value: '12,000+', label: 'Students enrolled' },
          { value: '40', label: 'Interactive lessons' },
          { value: '94%', label: 'Finish the course' },
        ],
      },
    },
    cta: {
      type: 'CtaBanner',
      props: {
        heading: 'Ready to start speaking Spanish?',
        subtitle: 'Your first three lessons are free.',
        primaryLabel: 'Create my account',
        primaryHref: '/auth/sign-up',
        secondaryLabel: null,
        secondaryHref: null,
      },
    },
  },
}

// 3) Validate the AI output against the catalog (this is the anti-hallucination guarantee).
console.log('=== 2. VALIDATION ===')
const spec = normalizeSpec(aiSpec)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const valid = (landingCatalog as any).validate(spec)
console.log('valid spec accepted:', valid.success)
if (!valid.success) console.log('errors:', valid.error?.message)

// 3b) And prove a hallucinated component is REJECTED.
const badSpec = normalizeSpec({
  root: 'x',
  elements: { x: { type: 'TotallyMadeUpBlock', props: {}, children: [] } },
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const badResult = (landingCatalog as any).validate(badSpec)
console.log('hallucinated component rejected:', !badResult.success)

const errorCount = valid.success ? 0 : 1

// 4) Convert to Puck Data — ready to hand to <Puck data={...}> for human editing.
console.log('\n=== 3. CONVERTED TO PUCK DATA ===')
const puckData = specToPuckData(spec)
console.log(JSON.stringify(puckData, null, 2))

console.log('\n=== RESULT ===')
console.log('Blocks in Puck page:', puckData.content.length)
console.log('Block types:', puckData.content.map((c) => c.type).join(' → '))
console.log(errorCount === 0 ? '✅ Pipeline OK' : '❌ Validation produced errors')
