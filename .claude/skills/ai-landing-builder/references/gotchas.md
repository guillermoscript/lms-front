# json-render → Puck: the full why behind each invariant

This is the long-form companion to SKILL.md. Read the relevant section when you're about to
touch that part of the pipeline. Each entry explains the symptom, the root cause, and the fix
that's already in place — so you don't reintroduce a bug we already paid for.

## Table of contents
1. Server bundling — why a generated JSON manifest exists
2. The LLM spec schema — array, propsJson, all-required
3. Validation API — `catalog.validate`, not `validateSpec`
4. `defineCatalog` needs `actions: {}`
5. `normalizeSpec` — required structural fields
6. defaultProps backfill — why blocks crashed on undefined arrays
7. The misstructured-root flatten fallback
8. The two prompt layers (catalog prompt + authoring guide)
9. The catalog ↔ Puck naming contract

---

## 1. Server bundling — why a generated JSON manifest exists

**Symptom:** `npm run build` fails inside Next's RSC resolver (`rsc.mjs`) when the catalog or the
API route is in the build graph.

**Root cause:** The catalog runs in a **server context** (the `/api/landing/generate` route is a
server route, and the catalog is imported there). If the catalog imports `lib/puck/config.ts` to
read each block's fields, it transitively pulls in the entire **client** Puck editor tree —
including `DropZone` from `@measured/puck` — into the server bundle. That client-only tree can't
be resolved server-side and the build breaks.

**Fix in place:** `scripts/gen-puck-fields-manifest.ts` runs under `tsx` (where importing
`puckConfig` is fine), strips everything non-serializable (function field renderers, `render`
fns), and emits `lib/json-render/puck-fields.generated.json` — **pure data, no React imports**.
The catalog imports that JSON. `lib/puck/config.ts` stays the single source of truth; the
manifest is a derived artifact. This is the keystone that lets one definition feed both the
client editor and the server-side AI generator.

**Implication:** anything the catalog/route needs from a block (fields, defaultProps, category)
must be added to the manifest generator, not imported live from config.ts.

---

## 2. The LLM spec schema — array, propsJson, all-required

**Symptoms (both real errors we hit):**
- `Invalid schema for response_format 'response': In context=('properties','elements'), 'propertyNames' is not permitted.`
- `Invalid schema … 'required' is required to be supplied and to be an array including every key in properties. Missing 'children'.`

**Root cause:** OpenAI's structured-output (`generateObject` with a Zod schema) is stricter than
plain JSON Schema:
- `z.record(z.string(), X)` compiles to a schema using `propertyNames` → **rejected**. This bites
  both an `elements` map AND any open-ended `props` object.
- Every property must appear in the JSON Schema `required` array → `.optional()` is **rejected**.

**Fix in place** (in both `app/api/landing/generate/route.ts` and the live-test script):
```ts
const specShape = z.object({
  root: z.string(),
  elements: z.array(z.object({
    id: z.string(),
    type: z.string(),
    propsJson: z.string()            // props as a JSON *string*, parsed server-side
      .describe('A JSON object string of this block\'s props, e.g. {"title":"..."}'),
    children: z.array(z.string())    // REQUIRED — model uses [] for leaf sections
      .describe('Child element ids in order; empty array for leaf section blocks.'),
  })),
})
```
Server-side we parse `propsJson` and fold the array into the keyed-map spec the bridge expects:
```ts
const arraySpec = { root: object.root, elements: object.elements.map(el => ({
  id: el.id, type: el.type, children: el.children,
  props: el.propsJson ? JSON.parse(el.propsJson) : {},   // tolerate bad JSON → {}
})) }
const spec = normalizeSpec(arraySpecToSpec(arraySpec))
```
Per-block prop *shapes* are still enforced afterward by `landingCatalog.validate()` — the loose
`propsJson` string is just to get past OpenAI's schema validator, not a loosening of safety.

---

## 3. Validation API — `catalog.validate`, not `validateSpec`

The json-render docs show `validateSpec(spec, { catalog })`. In our installed version
(`@json-render/core` / `@json-render/react` ^0.19) that export doesn't exist. The real API is:
```ts
const result = (landingCatalog as any).validate(spec)  // { success: boolean, error?: ZodError }
if (!result.success) { /* 422, surface result.error.issues */ }
```
This is the anti-hallucination guarantee: a spec referencing a component we don't have, or a prop
that doesn't exist, fails here and never reaches the renderer.

---

## 4. `defineCatalog` needs `actions: {}`

```ts
export const landingCatalog = defineCatalog(schema, {
  components: components as any,
  actions: {},   // required key even though we have no actions; TS error without it
})
```
`schema` imports from `@json-render/react/schema`.

---

## 5. `normalizeSpec` — required structural fields

Every json-render element requires `children` and `visible`. LLMs routinely omit them, which
fails `catalog.validate()`. `normalizeSpec()` fills defaults (`children: []`, `visible: true`)
on a copy before validation. Always run it between `arraySpecToSpec` and `validate`.

---

## 6. defaultProps backfill — why blocks crashed on undefined arrays

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'length')` thrown from a
block's `render`, caught by the page's error boundary → "Admin panel error" / blank section.

**Root cause:** When the AI emits a block but omits an array prop (e.g. `StatsBand` with just
`{id}`), that prop arrives `undefined`. We assumed Puck's `<Render>` would backfill the block's
`defaultProps` like the editor does — **it does not** reliably do so for top-level props. So a
block doing `items.length` / `items.map(...)` throws.

**Fix in place (covers all array blocks at once):**
- The manifest now captures each block's `defaultProps` (serializable copy).
- The catalog exports `DEFAULT_PROPS_BY_TYPE` (component name → defaultProps).
- `specToPuckData(spec, DEFAULT_PROPS_BY_TYPE)` merges defaults UNDER the AI props:
  ```ts
  props: { id, ...(defaultsByType[el.type] ?? {}), ...cleanProps(el.props) }
  ```
  So a missing array falls back to the block's populated default; present props still win.

**Implication:** every array-based block MUST declare a non-empty array in its `defaultProps`,
or the backfill has nothing to give it. Belt-and-suspenders: also guard in render
(`const safe = items ?? []`). `StatsBand` has this guard as the reference example.

---

## 7. The misstructured-root flatten fallback

**Symptom:** a spec validates fine but renders 0 or 1 blocks.

**Root cause:** LLMs get page structure wrong in two common ways:
(a) `root` names an id that has no matching element; (b) the model makes a real section
(`HeroBlock`) the "root" and hangs the other sections off ITS `children`. A naive
"render root.children" then renders nothing or just the hero.

**Fix in place** (`specToPuckData`): only treat the root as a container when it's a **typeless**
element whose `children` list real elements. Otherwise, flatten — render **all** elements in
array/insertion order, ignoring the (misused) nesting. For a flat landing page every block is a
top-level section, so flattening yields the full page. Keep this; it's defensive against the
single most common LLM structural mistake.

---

## 8. The two prompt layers

The system prompt = `landingCatalog.prompt()` + `'\n\n'` + `LANDING_AUTHORING_GUIDE`.

- `landingCatalog.prompt()` is json-render's **generic** UI-builder prompt: it talks about JSONL /
  RFC-6902 JSON Patch / `$state` / `repeat` / tabs — **none of which our pipeline uses** — plus
  the genuinely useful **AVAILABLE COMPONENTS** list (every block with its prop enums +
  descriptions). We keep it for the component list.
- `LANDING_AUTHORING_GUIDE` (`lib/json-render/authoring-guide.ts`) **overrides the output format**
  ("ignore the JSONL/JSON-Patch/$state stuff above; return one object with root + elements
  array…") and coaches the model to build a *good* page: 6–9 sections, open with HeroBlock close
  with CtaBanner, prefer rich marketing sections over bare primitives, write real benefit-driven
  copy, fill arrays with 3+ items, pick one tasteful accent color, use real CTA hrefs.

It's shared between the route and the live-test script via the exported constant so they can't
drift. Tune page quality here.

---

## 9. The catalog ↔ Puck naming contract

The catalog's component **names and prop shapes are deliberately identical** to the Puck blocks.
That's what makes the bridge (`specToPuckData`) a flatten + pass-through instead of a translation
layer. If you rename a prop on the Puck side, regenerate the manifest and the catalog follows
automatically (props are derived). The only hand-authored, non-derived thing is the AI
`DESCRIPTIONS` map — keep its keys matching component names.

`EXCLUDED` (in `catalog.ts`) lists structural/primitive blocks (Section, Container, Columns,
Grid, Card, Spacer, Divider, IconBlock, BadgeBlock) that humans use to compose layouts in Puck
but the AI should not emit as standalone page sections. 39 total blocks − 9 excluded = 30
generatable.
