/**
 * POST /api/landing/generate
 *
 * AI landing-page generation endpoint — the runtime that ties the json-render catalog to
 * the Puck editor. Flow:
 *
 *   prompt ─▶ LLM (constrained by landingCatalog.prompt()) ─▶ json-render spec
 *          ─▶ validateSpec() ─▶ specToPuckData() ─▶ Puck Data (returned to the editor)
 *
 * The client opens the returned `data` in the existing Puck editor, so a creator can
 * generate a full page from a sentence and then refine any block by hand. One vocabulary,
 * two flows. See docs/adr/0001-json-render-puck-landing-builder.md.
 *
 * NOTE: This is the proof-stage wiring. It uses generateObject with a permissive spec shape
 * (the catalog is the real guardrail via validateSpec). Streaming via useUIStream is the
 * production upgrade once the UX is settled.
 */
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AI_CONFIG } from '@/lib/ai/config'
import { generateObject } from 'ai'
import { z } from 'zod'
import { landingCatalog, DEFAULT_PROPS_BY_TYPE } from '@/lib/json-render/catalog'
import {
  specToPuckData,
  normalizeSpec,
  arraySpecToSpec,
  type JsonRenderArraySpec,
} from '@/lib/json-render/to-puck'
import { LANDING_AUTHORING_GUIDE } from '@/lib/json-render/authoring-guide'

export const maxDuration = 120

// Permissive structural schema — the catalog enforces the real constraints via validateSpec.
// `elements` is an ARRAY (not z.record) because OpenAI's structured-output mode rejects the
// `propertyNames` keyword that z.record(z.string(), …) compiles to. We fold the array back
// into a keyed map with arraySpecToSpec() before validating. See to-puck.ts.
const specShape = z.object({
  root: z.string(),
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      // Props as a JSON string: OpenAI structured-output rejects open-ended objects
      // (z.record → `propertyNames`/`additionalProperties`). The model writes a JSON
      // object string here; we parse it below. Component-specific shapes are then enforced
      // by landingCatalog.validate().
      propsJson: z
        .string()
        .describe('A JSON object string of this block\'s props, e.g. {"title":"...","subtitle":"..."}'),
      children: z
        .array(z.string())
        .describe('Child element ids in order; empty array for leaf section blocks.'),
    })
  ),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!tenantId) return new Response('No tenant context', { status: 400 })

  const { prompt } = await req.json()
  if (!prompt || typeof prompt !== 'string') {
    return new Response('A `prompt` string is required', { status: 400 })
  }

  // The catalog generates the base system prompt that constrains the model to our blocks
  // (the AVAILABLE COMPONENTS list with every prop + enum). We append landing-page–specific
  // authoring guidance so the model produces a rich, well-structured, on-brand page rather
  // than a thin 4-block stub. See docs/adr/0001-json-render-puck-landing-builder.md.
  const systemPrompt = landingCatalog.prompt() + '\n\n' + LANDING_AUTHORING_GUIDE

  let object: z.infer<typeof specShape>
  try {
    const result = await generateObject({
      model: AI_CONFIG.defaultModel,
      schema: specShape,
      system: systemPrompt,
      prompt: `Build a landing page: ${prompt}`,
    })
    object = result.object
  } catch (err) {
    console.error('[landing/generate] model error', err)
    return new Response('Generation failed', { status: 502 })
  }

  // Parse each block's propsJson string into an object, then fold the array into the
  // keyed-map spec the rest of the pipeline expects.
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

  // Fill required structural fields the LLM may omit, then validate against the catalog.
  const spec = normalizeSpec(arraySpecToSpec(arraySpec))

  // Anti-hallucination guarantee: the catalog rejects unknown components / bad props.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (landingCatalog as any).validate(spec)
  if (!result.success) {
    console.warn('[landing/generate] invalid spec', result.error?.message)
    return Response.json(
      {
        error: 'The generated page did not match the component catalog.',
        issues: result.error?.issues ?? result.error?.message,
      },
      { status: 422 }
    )
  }

  // Hand back Puck Data ready to load into the editor.
  const data = specToPuckData(spec, DEFAULT_PROPS_BY_TYPE)
  return Response.json({ data, spec })
}
