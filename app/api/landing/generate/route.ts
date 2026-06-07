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
import { landingCatalog } from '@/lib/json-render/catalog'
import { specToPuckData, normalizeSpec, type JsonRenderSpec } from '@/lib/json-render/to-puck'

export const maxDuration = 120

// Permissive structural schema — the catalog enforces the real constraints via validateSpec.
const specShape = z.object({
  root: z.string(),
  elements: z.record(
    z.string(),
    z.object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()).optional(),
      children: z.array(z.string()).optional(),
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

  // The catalog generates the system prompt that constrains the model to our blocks.
  const systemPrompt =
    landingCatalog.prompt() +
    '\n\nReturn a single JSON object with `root` (an element key) and `elements` ' +
    '(a flat map keyed by element id). The root element should list the section blocks ' +
    'in order via its `children`. Use only the documented components and props.'

  let object: unknown
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

  // Fill required structural fields the LLM may omit, then validate against the catalog.
  const spec = normalizeSpec(object as JsonRenderSpec)

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
  const data = specToPuckData(spec)
  return Response.json({ data, spec })
}
