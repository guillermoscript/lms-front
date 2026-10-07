import { z } from 'zod'

/**
 * Structured-output schemas for the landing-page AI (`/api/landing/generate`).
 *
 * These must stay valid under OpenAI's strict structured-output mode AND the other BYOK
 * providers' native modes (see `.claude/skills/ai-landing-builder`, invariant #2):
 *   - `elements` is an ARRAY (never `z.record`, which compiles to `propertyNames`),
 *   - props are a JSON STRING (`propsJson`) parsed server-side,
 *   - every key is required (no `.optional()`, use `[]` / `""`), nothing is `.nullable()`-less
 *     optional, and no unions of objects.
 * `tests/unit/landing-structured-output.test.ts` pins these rules against the JSON Schema
 * the AI SDK actually sends.
 */
export const pageSpecShape = z.object({
  root: z.string(),
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      propsJson: z
        .string()
        .describe('A JSON object string of this block\'s props, e.g. {"title":"...","subtitle":"..."}'),
      children: z.array(z.string()).describe('Child element ids in order; [] for leaf sections.'),
    })
  ),
})

export const blockEditShape = z.object({
  propsJson: z
    .string()
    .describe(
      'A JSON object string with the FULL updated props for this block (all props it should ' +
        'have after the edit, not just the changed ones), e.g. {"title":"...","subtitle":"..."}'
    ),
})
