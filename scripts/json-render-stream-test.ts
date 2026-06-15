/**
 * LIVE test of the STREAMING landing-page generation — mirrors app/api/landing/generate/route.ts
 * (streamObject → partialObjectStream progress → validate → specToPuckData), bypassing only the
 * HTTP/cookie-auth wrapper. Proves progress events fire and the final object validates + bridges.
 *
 * Run: npx tsx scripts/json-render-stream-test.ts "your page description"
 * Requires OPENAI_API_KEY in .env.local.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { streamObject } from 'ai'
import { z } from 'zod'
import { AI_CONFIG } from '../lib/ai/config'
import { landingCatalog, DEFAULT_PROPS_BY_TYPE } from '../lib/json-render/catalog'
import {
  specToPuckData,
  normalizeSpec,
  arraySpecToSpec,
  type JsonRenderArraySpec,
} from '../lib/json-render/to-puck'
import { LANDING_AUTHORING_GUIDE } from '../lib/json-render/authoring-guide'

const prompt =
  process.argv[2] ??
  'A premium, complete landing page for an online photography masterclass.'

const specShape = z.object({
  root: z.string(),
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      propsJson: z.string(),
      children: z.array(z.string()),
    })
  ),
})

async function main() {
  console.log('Prompt:', prompt, '\n→ Streaming…\n')
  const t0 = Date.now()

  const result = streamObject({
    model: AI_CONFIG.defaultModel,
    schema: specShape,
    system: landingCatalog.prompt() + '\n\n' + LANDING_AUTHORING_GUIDE,
    prompt: `Build a landing page: ${prompt}`,
  })

  let lastCount = 0
  let firstAt = 0
  for await (const partial of result.partialObjectStream) {
    const els = partial?.elements
    if (!Array.isArray(els)) continue
    if (els.length > lastCount) {
      if (!firstAt) firstAt = Date.now() - t0
      lastCount = els.length
      const last = els[els.length - 1]
      console.log(`  [+${String(Date.now() - t0).padStart(5)}ms] block ${els.length}: ${last?.type ?? '?'}`)
    }
  }

  const object = await result.object
  const usage = await result.usage
  console.log(`\n← Complete in ${Date.now() - t0}ms (first progress at ${firstAt}ms). Usage:`, usage)

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validation = (landingCatalog as any).validate(spec)
  console.log('Validation passed:', validation.success)
  if (!validation.success) {
    console.log('Issues:', validation.error?.message?.slice(0, 400))
    process.exitCode = 1
    return
  }

  const data = specToPuckData(spec, DEFAULT_PROPS_BY_TYPE)
  console.log(`\nFinal Puck page — ${data.content.length} blocks:`)
  for (const c of data.content) console.log(`  • ${c.type}`)
  console.log('\n✅ Streaming pipeline OK.')
}

main().catch((e) => {
  console.error('❌ Failed:', e?.message ?? e)
  process.exitCode = 1
})
