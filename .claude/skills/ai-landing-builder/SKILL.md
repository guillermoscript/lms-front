---
name: ai-landing-builder
description: >-
  How the AI landing-page builder works in this LMS — the json-render → Puck pipeline that lets
  creators generate a full landing page from a sentence and then refine it by hand in the Puck
  editor. Use this skill whenever the task touches AI page generation, the "Generate with AI"
  button, the json-render catalog/spec/bridge, the Puck landing-page blocks, or the
  /api/landing/generate route — including adding a new block type, debugging a generated page
  that renders blank/crashes, changing what the AI is allowed to emit, fixing OpenAI
  structured-output schema errors in this area, or regenerating the puck-fields manifest. Reach
  for it even when the user just says "the landing page generator", "the AI page thing", or
  names one of the lib/json-render files, since the pipeline has several non-obvious invariants
  that are easy to break without it.
---

# AI Landing-Page Builder (json-render → Puck)

## The one idea

A creator types a sentence → an LLM generates a **json-render spec** constrained to *our* block
vocabulary → we validate it → bridge it to **Puck `Data`** → it opens in the **existing Puck
editor** for human drag-and-drop refinement → saved to `landing_pages.puck_data`.

**One vocabulary, two flows.** The blocks the AI can emit are the *same* blocks a human edits in
Puck. That's the whole point: AI solves the blank-page problem, Puck handles "let me just tweak
this one thing." Every block you wrap for Puck automatically becomes generatable by the AI, and
vice-versa. Decision recorded in `docs/adr/0001-json-render-puck-landing-builder.md`.

```
creator sentence
   │  POST /api/landing/generate
   ▼  landingCatalog.prompt() + LANDING_AUTHORING_GUIDE  ── constrains the LLM to our blocks
LLM → array spec  { root, elements:[{id,type,propsJson,children}] }
   │  arraySpecToSpec() → normalizeSpec()                ── fold to map, fill required fields
   │  landingCatalog.validate()                          ── REJECT unknown components/props
   ▼  specToPuckData(spec, DEFAULT_PROPS_BY_TYPE)        ── the bridge (backfills defaults)
Puck Data  ──▶  dispatch({type:'setData'})  ──▶  opens live in the Puck editor
   ▼  saved to landing_pages.puck_data
```

## Map of the system

| File | Role |
|---|---|
| `lib/puck/config.ts` | **Single source of truth.** All Puck blocks (`ComponentConfig`) + categories. |
| `lib/puck/components/**` | The block implementations (`fields`, `defaultProps`, `render`). |
| `scripts/gen-puck-fields-manifest.ts` | Codegen: reads `puckConfig`, emits the JSON manifest. |
| `lib/json-render/puck-fields.generated.json` | **Generated** pure-data manifest (`fields` + `defaultProps` + category). Never hand-edit. |
| `lib/json-render/from-puck-fields.ts` | `puckFieldsToZod()` — turns a block's Puck `fields` into a Zod schema. |
| `lib/json-render/catalog.ts` | Builds the json-render catalog from the manifest. Exports `landingCatalog`, `CATALOG_COMPONENT_NAMES`, `DEFAULT_PROPS_BY_TYPE`. Holds `EXCLUDED` + `DESCRIPTIONS`. |
| `lib/json-render/authoring-guide.ts` | `LANDING_AUTHORING_GUIDE` — the landing-specific prompt suffix (output shape + how to build a good page). Shared by the route and the test script. |
| `lib/json-render/to-puck.ts` | The bridge: `arraySpecToSpec`, `normalizeSpec`, `specToPuckData`. |
| `app/api/landing/generate/route.ts` | The endpoint: auth + tenant scope → `generateObject` → validate → Puck Data. |
| `components/admin/landing-page/generate-with-ai.tsx` | The "Generate with AI" button + dialog; injects via `dispatch({type:'setData'})`. |
| `scripts/json-render-live-test.ts` | Offline end-to-end test with a REAL OpenAI call (reads `.env.local`). |

## Critical invariants — read before editing anything here

These are the non-obvious rules the pipeline depends on. Breaking one usually produces a blank
page, a render crash, or a build failure that's hard to trace back. Full explanations and the
"why" behind each are in `references/gotchas.md` — read it whenever you touch the spec schema,
the catalog, the bridge, or the route.

1. **Never import `lib/puck/config.ts` into a server context** (the API route or the catalog).
   It bundles the client Puck editor tree (`DropZone` from `@measured/puck`) into the server
   build and breaks `npm run build`. The catalog imports the *generated JSON manifest* instead.
   That's the entire reason the manifest exists.

2. **The LLM spec must be an ARRAY, not a keyed map, and every field is required.** OpenAI's
   structured-output mode rejects `z.record(...)` (it compiles to `propertyNames`) and rejects
   `.optional()` (strict mode requires every key in `required`). So the schema is
   `elements: z.array(z.object({ id, type, propsJson, children }))` — props are a **JSON
   string** (`propsJson`) parsed server-side, and `children` is required (use `[]`).

3. **Validation is `landingCatalog.validate(spec)`** returning `{success, error}` (a ZodError) —
   NOT the documented `validateSpec(spec, {catalog})`, which doesn't exist in our version.

4. **`defineCatalog(schema, {components, actions: {}})` requires the `actions` key** even if
   empty, or it's a TS error.

5. **`normalizeSpec()` must run before validating.** Every json-render element requires
   `children` and `visible`; LLMs omit them, so `normalizeSpec` fills `children:[]`,
   `visible:true`.

6. **`specToPuckData` backfills `DEFAULT_PROPS_BY_TYPE`.** Puck's `Render` does NOT reliably
   apply a block's `defaultProps` for top-level props, so a block that maps over an array the
   AI omitted will crash on `items.length`. The bridge merges `{...defaults, ...aiProps}` so
   every block always has its arrays. **Consequence: every array-based block MUST declare a
   populated array in its `defaultProps`.**

7. **The bridge tolerates a misstructured root.** LLMs often name a `root` id that doesn't exist
   or make `HeroBlock` the parent of the other sections. `specToPuckData` only honors a typeless
   container root; otherwise it flattens all elements in array order. Don't "simplify" this
   away — it's what stops a valid-but-misstructured spec rendering as an empty/1-block page.

## Adding a new block (so the AI can generate it)

The naming and prop shapes stay **identical** between the Puck block and the catalog — that's
what keeps the bridge a trivial pass-through. Steps:

1. **Write the Puck block** as a `ComponentConfig` in `lib/puck/components/**` (follow an
   existing one, e.g. `lms/stats-band.tsx`). Register it in `lib/puck/config.ts`
   (`components` + the right `categories` array).
   - If it has any **array prop** (`items`, `members`, `images`, …), give it a **populated
     `defaultProps`** for that array, and guard the render (`const safe = items ?? []`). This is
     invariant #6 — without it the block crashes when the AI omits the array.
   - For internal links use `next/link` `<Link>`. The project `Button` is `@base-ui/react` and
     has **no `asChild`** — wrap `<Link><Button/></Link>`, never `<button>` inside `<a>`.
2. **Regenerate the manifest:** `npm run gen:puck-fields`. This re-emits
   `puck-fields.generated.json` with the new block's fields + defaultProps. The catalog and the
   defaults backfill pick it up automatically.
3. **Add an AI description** for it in the `DESCRIPTIONS` map in `lib/json-render/catalog.ts`
   (one sentence on when the AI should use it). Without one it still works but gets a generic
   note. If it's a structural/primitive block humans use to compose layouts but the AI should
   not emit as a page section, add its name to `EXCLUDED` instead.
4. **(Optional) Tune the flow.** If it should appear in the default page flow, mention it in
   `LANDING_AUTHORING_GUIDE` (`lib/json-render/authoring-guide.ts`).
5. **Verify:** `npx tsc --noEmit` (0 errors) and run the live test below.

## Testing

**Fast, offline, real model call** (proves the exact logic the button runs, minus HTTP/auth):
```bash
npx tsx scripts/json-render-live-test.ts "A landing page for <whatever>"
```
Requires a valid `OPENAI_API_KEY` in `.env.local`. It prints the generated block list, runs
`catalog.validate`, and dumps the Puck `Data`. A healthy run shows 6–9 blocks opening with
HeroBlock and closing with CtaBanner.

**Full UI flow** (admin only): in the Puck editor, click **Generate with AI** → type a prompt →
the result injects live via `dispatch({type:'setData'})`. The landing builder has **no plan
gate** and the editor is admin-only — a student session is redirected by `proxy.ts`.

**After saving/publishing**, view via the admin preview route
`/dashboard/admin/landing-page/preview/<pageId>` (it renders `PuckPageRenderer` without the
public tenant gate). Note: the **default tenant** (`00000000-…-0001`) can publish a Home page
that never renders on the public site — the public route hard-skips the default tenant; real
tenants on subdomains are unaffected.

## Debugging cheatsheet

- **Generated page is blank / fewer blocks than expected** → the root was misstructured and the
  flatten fallback isn't catching it, OR `children` nesting swallowed siblings. Inspect the raw
  spec (the live-test script prints it) and check `specToPuckData`'s key-selection logic.
- **`Cannot read properties of undefined (reading 'length')` in `<render>`** → an array-based
  block got `undefined`. Confirm that block has a populated array in `defaultProps`, the
  manifest was regenerated, and the caller passes `DEFAULT_PROPS_BY_TYPE` to `specToPuckData`.
- **`Invalid schema for response_format … 'propertyNames' is not permitted`** → a `z.record`
  crept into the `generateObject` schema. Use the array + `propsJson` shape (invariant #2).
- **`… 'required' is required to be … including every key`** → a `.optional()` in the schema;
  strict mode forbids it. Make the field required (use `[]`/`""` defaults instead).
- **`npm run build` fails resolving `@measured/puck` / `rsc.mjs`** → something server-side
  imported `lib/puck/config.ts`. Route it through the generated manifest instead (invariant #1).
- **Catalog/backfill out of sync with a block** → you changed a block's `fields`/`defaultProps`
  but didn't `npm run gen:puck-fields`. The manifest is a derived artifact; regenerate it.

## Production-readiness backlog (not yet done)

If asked "what's left to ship this": rate-limiting + plan-gating on `/api/landing/generate`
(each call is a paid model call, currently ungated); per-component `?? []` guards as
defense-in-depth beyond the backfill; an error boundary around `PuckPageRenderer`; hook
`npm run gen:puck-fields` into precommit/CI so the manifest can't go stale; streaming
(`streamObject`) to replace the ~10s blank wait; and `$state` data-binding to wire `CourseGrid`
/ pricing to the tenant's real courses (the future unlock json-render was chosen for).
