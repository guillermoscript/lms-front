/**
 * LIVE end-to-end test of the AI landing-page generation pipeline — including a REAL OpenAI call.
 *
 * Runs the exact logic of app/api/landing/generate/route.ts (catalog prompt → generateObject →
 * catalog.validate → specToPuckData), bypassing only the HTTP/cookie-auth wrapper. This proves
 * the pipeline the "Generate with AI" button depends on, with a genuine model call.
 *
 * Run: npx tsx scripts/json-render-live-test.ts "your page description"
 * Requires OPENAI_API_KEY in .env.local.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { generateObject } from 'ai'
import { z } from 'zod'
import { AI_CONFIG } from '../lib/ai/config'
import { landingCatalog, CATALOG_COMPONENT_NAMES, DEFAULT_PROPS_BY_TYPE } from '../lib/json-render/catalog'
import {
  specToPuckData,
  normalizeSpec,
  arraySpecToSpec,
  type JsonRenderArraySpec,
} from '../lib/json-render/to-puck'
import { LANDING_AUTHORING_GUIDE } from '../lib/json-render/authoring-guide'

const prompt =
  process.argv[2] ??
  'A landing page for a beginner Spanish course: hero, key stats, what you learn, student testimonials, and a sign-up call to action.'

// elements is an ARRAY (not z.record) — OpenAI structured-output rejects propertyNames.
// props is a JSON string for the same reason. See app/api/landing/generate/route.ts.
const specShape = z.object({
  root: z.string(),
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      propsJson: z
        .string()
        .describe('A JSON object string of this block\'s props, e.g. {"title":"..."}'),
      children: z
        .array(z.string())
        .describe('Child element ids in order; empty array for leaf section blocks.'),
    })
  ),
})

async function main() {
  console.log('Catalog exposes', CATALOG_COMPONENT_NAMES.length, 'components')
  console.log('Prompt:', prompt, '\n')

  const systemPrompt = landingCatalog.prompt() + '\n\n' + LANDING_AUTHORING_GUIDE

  console.log('→ Calling OpenAI (', String(AI_CONFIG.defaultModel), ')...')
  const t0 = Date.now()
  const { object } = await generateObject({
    model: AI_CONFIG.defaultModel,
    schema: specShape,
    system: systemPrompt,
    prompt: `Build a landing page: ${prompt}`,
  })
  console.log(`← Model responded in ${Date.now() - t0}ms\n`)

  const arraySpec: JsonRenderArraySpec = {
    root: object.root,
    elements: object.elements.map((el) => {
      let props: Record<string, unknown> = {}
      try {
        props = el.propsJson ? JSON.parse(el.propsJson) : {}
      } catch {
        props = {}
      }
      return { id: el.id, type: el.type, props, children: el.children }
    }),
  }

  const spec = normalizeSpec(arraySpecToSpec(arraySpec))

  // Validate against catalog (anti-hallucination)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (landingCatalog as any).validate(spec)
  console.log('Validation passed:', result.success)
  if (!result.success) {
    console.log('Issues:', result.error?.message?.slice(0, 500))
    process.exitCode = 1
    return
  }

  const data = specToPuckData(spec, DEFAULT_PROPS_BY_TYPE)
  console.log('\nGenerated Puck page —', data.content.length, 'blocks:')
  for (const c of data.content) {
    const props = c.props as Record<string, unknown>
    const preview =
      (props.title as string) ||
      (props.heading as string) ||
      (props.text as string) ||
      ''
    console.log(`  • ${c.type}${preview ? `  "${String(preview).slice(0, 60)}"` : ''}`)
  }

  console.log('\n--- Full Puck Data (loadable into <Puck data={...}>) ---')
  console.log(JSON.stringify(data, null, 2))
  console.log('\n✅ LIVE pipeline OK — this is exactly what the Generate button injects via setData.')
}

main().catch((e) => {
  console.error('❌ Failed:', e?.message ?? e)
  process.exitCode = 1
})
