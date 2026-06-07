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
 * One element as the LLM emits it when `elements` is an ARRAY (not a keyed map).
 *
 * Why an array: OpenAI's structured-output mode rejects JSON schemas containing
 * `propertyNames`, which is exactly what `z.record(z.string(), …)` compiles to. So the
 * model returns `elements` as a list of `{ id, … }` objects and we fold it back into the
 * keyed-map spec the rest of the pipeline (normalizeSpec, catalog.validate, specToPuckData)
 * already expects.
 */
export interface JsonRenderElementInput {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: string[]
}

/** Spec shape as emitted by the model: a root id + a flat array of elements. */
export interface JsonRenderArraySpec {
  root: string
  elements: JsonRenderElementInput[]
}

/**
 * Fold the array form (`elements: [{id, …}]`) into the keyed-map spec
 * (`elements: { [id]: … }`) used everywhere downstream. Duplicate ids: last one wins.
 */
export function arraySpecToSpec(spec: JsonRenderArraySpec): JsonRenderSpec {
  const elements: JsonRenderSpec['elements'] = {}
  for (const el of spec.elements ?? []) {
    if (!el?.id) continue
    elements[el.id] = {
      type: el.type,
      props: el.props,
      children: el.children,
    }
  }
  return { root: spec.root, elements }
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
 * @param spec          A json-render flat spec (already validated against the catalog).
 * @param defaultsByType Each component type's Puck defaultProps, merged UNDER the AI props so
 *                       a generated block always has its required arrays/values even when the
 *                       model omits them. Puck's Render does not reliably backfill top-level
 *                       props, so a missing array would otherwise crash a block at
 *                       `items.length`. Pass DEFAULT_PROPS_BY_TYPE from the catalog.
 * @param idFn          Optional id generator for Puck props.id (defaults to the element key).
 */
export function specToPuckData(
  spec: JsonRenderSpec,
  defaultsByType: Record<string, Record<string, unknown>> = {},
  idFn: (elementKey: string, index: number) => string = (k) => k
): Data {
  const allKeys = Object.keys(spec.elements)
  const rootEl = spec.elements[spec.root]

  // Determine the ordered list of section keys to render.
  //
  // Happy path: a dedicated root container element exists and its `children` lists the
  // sections in order. But LLMs frequently get this wrong — e.g. naming a `root` id that
  // has no matching element, or making the first section (HeroBlock) the parent of the rest.
  // So we fall back to "every element that nobody else claims as a child", in array order.
  // This keeps a valid-but-misstructured spec from rendering as an empty page.
  let childKeys: string[]
  const rootChildren = rootEl?.children?.filter((k) => spec.elements[k])

  if (rootEl && !rootEl.type && rootChildren && rootChildren.length > 0) {
    // Happy path: a dedicated, typeless root *container* whose `children` order the sections.
    childKeys = rootChildren
  } else {
    // Fallback for the common LLM mistakes:
    //   (a) `root` names an id with no matching element, or
    //   (b) the model made a real section (e.g. HeroBlock) the "root" and hung the other
    //       sections off its `children`.
    // For a flat landing page every block is a top-level section, so we flatten: take all
    // elements in their array/insertion order, ignoring the (misused) nesting. This turns a
    // valid-but-misstructured spec into the full page instead of an empty or 1-block page.
    childKeys = allKeys
  }

  const content = childKeys
    .map((key, index) => {
      const el = spec.elements[key]
      if (!el) return null
      // Puck requires a stable props.id per component instance.
      const id = idFn(key, index)
      // Merge order: component defaults first, then the AI's (cleaned) props override them.
      // This backfills any prop the model omitted (e.g. an array a block maps over) so the
      // block never receives `undefined` where it expects an array/value.
      const defaults = defaultsByType[el.type] ?? {}
      return {
        type: el.type,
        props: { id, ...defaults, ...cleanProps(el.props) },
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return {
    content,
    root: { props: {} },
  }
}
