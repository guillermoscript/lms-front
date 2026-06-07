/**
 * Bridge: json-render spec  →  Puck `Data`.
 *
 * This is the keystone of the two-flow architecture. An AI generates a json-render spec
 * (flat `root` + `elements` map, constrained to `landingCatalog`); this function converts
 * it into the exact `Data` shape Puck's editor and renderer expect, so the generated page
 * can be opened in the existing Puck UI for human drag-and-drop refinement.
 *
 * Because the catalog component names and prop shapes deliberately mirror the Puck
 * components (see lib/json-render/catalog.ts), the conversion is largely a flatten +
 * pass-through. Props that the Puck component expects but the AI omits fall back to the
 * Puck component's own `defaultProps` at render time, so partial specs still render.
 *
 * Scope: landing pages are a flat, ordered list of section blocks, so we walk the root's
 * children in order. Nested slots are not needed for the proof; the structure below extends
 * to them by recursing into `children` for components that declare Puck `zones`.
 */
import type { Data } from '@measured/puck'

/** Minimal structural type for a json-render flat spec (matches @json-render/react schema). */
export interface JsonRenderSpec {
  root: string
  elements: Record<
    string,
    {
      type: string
      props?: Record<string, unknown>
      children?: string[]
      visible?: unknown
    }
  >
}

/**
 * Fill in the structural fields the json-render schema requires on every element
 * (`children` and `visible`) so a spec from an LLM — which often omits them — passes
 * `catalog.validate()`. Mutates a copy, returns it.
 */
export function normalizeSpec(spec: JsonRenderSpec): JsonRenderSpec {
  const elements: JsonRenderSpec['elements'] = {}
  for (const [key, el] of Object.entries(spec.elements ?? {})) {
    elements[key] = {
      type: el.type,
      props: el.props ?? {},
      children: el.children ?? [],
      visible: el.visible ?? true,
    }
  }
  return { root: spec.root, elements }
}

/** Drop null/undefined props so Puck falls back to each component's defaultProps. */
function cleanProps(props: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v !== null && v !== undefined) out[k] = v
  }
  return out
}

/**
 * Convert a validated json-render spec into Puck `Data`.
 *
 * @param spec   A json-render flat spec (already validated against the catalog).
 * @param idFn   Optional id generator for Puck props.id (defaults to the element key).
 */
export function specToPuckData(
  spec: JsonRenderSpec,
  idFn: (elementKey: string, index: number) => string = (k) => k
): Data {
  const rootEl = spec.elements[spec.root]
  if (!rootEl) {
    return { content: [], root: { props: {} } }
  }

  const childKeys = rootEl.children ?? Object.keys(spec.elements).filter((k) => k !== spec.root)

  const content = childKeys
    .map((key, index) => {
      const el = spec.elements[key]
      if (!el) return null
      // Puck requires a stable props.id per component instance.
      const id = idFn(key, index)
      return {
        type: el.type,
        props: { id, ...cleanProps(el.props) },
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return {
    content,
    root: { props: {} },
  }
}
