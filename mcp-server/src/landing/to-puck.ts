/**
 * Bridge: json-render spec → Puck `Data` — MCP-server copy.
 *
 * Mirrors lib/json-render/to-puck.ts in the main repo (the MCP server is built and
 * deployed standalone, so it cannot import it). The logic must stay byte-for-byte
 * equivalent: a page created here opens in the same Puck editor the app uses. If you
 * change the original, change this too.
 *
 * The only divergence is the `PuckData` type: the app imports `Data` from
 * `@measured/puck`; here we inline the minimal structural shape we produce, which the
 * Puck renderer accepts as-is.
 */

/** Minimal structural shape of Puck `Data` as this bridge produces it. */
export interface PuckData {
  content: Array<{ type: string; props: Record<string, unknown> }>
  root: { props: Record<string, unknown> }
  zones?: Record<string, unknown>
}

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

/** One element as an agent supplies it: an array item with its own id. */
export interface JsonRenderElementInput {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: string[]
}

/** Spec shape as supplied: a root id + a flat array of elements. */
export interface JsonRenderArraySpec {
  root: string
  elements: JsonRenderElementInput[]
}

/**
 * Fold the array form (`elements: [{id, …}]`) into the keyed-map spec
 * (`elements: { [id]: … }`) used everywhere downstream. Duplicate ids: last one wins.
 */
export function arraySpecToSpec(spec: JsonRenderArraySpec): JsonRenderSpec {
  const elements: JsonRenderSpec["elements"] = {};
  for (const el of spec.elements ?? []) {
    if (!el?.id) continue;
    elements[el.id] = {
      type: el.type,
      props: el.props,
      children: el.children,
    };
  }
  return { root: spec.root, elements };
}

/**
 * Fill in the structural fields the json-render schema requires on every element
 * (`children` and `visible`) so a spec from an LLM — which often omits them — validates.
 */
export function normalizeSpec(spec: JsonRenderSpec): JsonRenderSpec {
  const elements: JsonRenderSpec["elements"] = {};
  for (const [key, el] of Object.entries(spec.elements ?? {})) {
    elements[key] = {
      type: el.type,
      props: el.props ?? {},
      children: el.children ?? [],
      visible: el.visible ?? true,
    };
  }
  return { root: spec.root, elements };
}

/** Drop null/undefined props so Puck falls back to each component's defaultProps. */
export function cleanProps(props: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Convert a validated json-render spec into Puck `Data`.
 *
 * @param spec           A json-render flat spec (already validated against the vocabulary).
 * @param defaultsByType Each component type's Puck defaultProps, merged UNDER the AI props so
 *                       a generated block always has its required arrays/values even when the
 *                       model omits them. Puck's Render does not reliably backfill top-level
 *                       props, so a missing array would otherwise crash a block at
 *                       `items.length`. Pass DEFAULT_PROPS_BY_TYPE from the catalog.
 * @param idFn           Optional id generator for Puck props.id (defaults to the element key).
 */
export function specToPuckData(
  spec: JsonRenderSpec,
  defaultsByType: Record<string, Record<string, unknown>> = {},
  idFn: (elementKey: string, index: number) => string = (k) => k
): PuckData {
  const allKeys = Object.keys(spec.elements);
  const rootEl = spec.elements[spec.root];

  // Happy path: a dedicated, typeless root *container* whose `children` order the sections.
  // Fallback (common LLM mistakes — root id with no element, or a real section as the
  // parent of the rest): flatten all elements in insertion order. Keeps a
  // valid-but-misstructured spec from rendering as an empty or 1-block page.
  let childKeys: string[];
  const rootChildren = rootEl?.children?.filter((k) => spec.elements[k]);

  if (rootEl && !rootEl.type && rootChildren && rootChildren.length > 0) {
    childKeys = rootChildren;
  } else {
    childKeys = allKeys;
  }

  const content = childKeys
    .map((key, index) => {
      const el = spec.elements[key];
      if (!el) return null;
      // Puck requires a stable props.id per component instance.
      const id = idFn(key, index);
      // Merge order: component defaults first, then the supplied (cleaned) props override
      // them — backfills any prop the model omitted (e.g. an array a block maps over).
      const defaults = defaultsByType[el.type] ?? {};
      return {
        type: el.type,
        props: { id, ...defaults, ...cleanProps(el.props) },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    content,
    root: { props: {} },
  };
}
