---
name: ai-landing-builder
description: >-
  How the AI landing-page builder works in this LMS — the Page Architect op protocol and shared
  core (`@lms/core` page-builder: ops, applyOps, catalog, validatePage, templates), the AI
  annotation side-map, and the older json-render → Puck pipeline. Use this skill whenever the
  task touches AI page generation, the editor's AI chat panel, `lib/puck/ai-annotations/`, the
  json-render catalog/spec/bridge, the Puck landing-page blocks, landing templates, or the
  /api/landing/* routes — including adding a new block type, debugging a generated page
  that renders blank/crashes, changing what the AI is allowed to emit, fixing OpenAI
  structured-output schema errors in this area, or regenerating the puck-fields manifest. Reach
  for it even when the user just says "the landing page generator", "the AI page thing", or
  names one of the lib/json-render files, since the pipeline has several non-obvious invariants
  that are easy to break without it.
---

# AI Landing-Page Builder (Page Architect + json-render → Puck)

## Page Architect (Oct 2026, replacing the json-render path)

Design: `docs/PAGE_ARCHITECT_DESIGN.md` (read its "Critique & corrections" — a correction wins
over the body). The AI no longer regenerates whole pages: it edits the live page through a
small **op protocol**, streamed to the editor and applied with one undo step per turn.

| File | Role |
|---|---|
| `packages/core/src/page-builder/` | Shared core, exported from `@lms/core`. Pure TS + zod, React-free. Used by the web route, the editor applier, the save actions and mcp-server. |
| `…/ops.ts` | `PageOp` zod: `add`, `update` (+`appends`), `updateRoot`, `move`, `remove`, `reset`. `ROOT_ZONE = 'root:default-zone'`. `PageBuilderDataParts` (`data-page-op`, `data-turn-status`). |
| `…/apply-ops.ts` | `applyOps(data, ops, catalog) → {data, warnings, applied}` (total: bad ops skip with a warning), `applyOpInPlace` (shadow page), `expandDuplicate`, `subtreeToAddOps`. |
| `…/tree.ts` | THE zone accessor (`getZone`/`setZone`/`zoneKeys`/`findNode`/`descendantIds`). |
| `…/appends.ts`, `array-defaults.ts` | Token streaming (`items[2].title` → tail) and array-item backfill. |
| `…/catalog.ts` | `pageCatalog` / `createCatalog(manifest)`: strict `validateBlock`, `promptDoc()`, `streamableFields`, `refFields`, `jsonSchema`. |
| `…/validate.ts` | Lenient `validatePage`, URL/colour rules, `PAGE_LIMITS`, ref-id checks. |
| `…/bindings.ts`, `templates.ts` | `cloneWithFreshIds`, binding substitution, `instantiateTemplate`, `templateToOps`, `PRESETS`, `instantiatePreset`, `presetToOps`. |
| `…/outline.ts` | `outline` / `formatOutline` — the compact page view for the model. |
| `…/generated/{manifest,templates}.generated.ts` | **Generated** by `npm run gen:puck-fields`. Never hand-edit or hand-merge. |
| `lib/puck/ai-annotations/` | The AI side-map, one file per owner: `base.ts` (existing blocks), `course-blocks.ts` (data-bound blocks), `style.ts` (style tokens), merged in `index.ts`. `'*'` = shared section fields. |
| `lib/json-render/catalog-meta.ts` | Legacy `COMPONENT_DESCRIPTIONS`/`EXCLUDED_COMPONENTS`, now derived from the annotations. |

### Page Architect invariants

1. **Core stays React-free and never imports `lib/puck/config.ts`** (nor `@measured/puck`).
   It reads blocks only from the generated manifest. `ai-annotations` is pure data (types only).
2. **No `duplicate` on the wire.** Puck's `duplicate` mints its own id and `replace` refuses an
   id change, so the server expands a duplicate into `add` ops (`expandDuplicate`). Block ids
   are always server-assigned `<Type>-<random>`; ids a model proposes are ignored.
3. **One zone accessor.** Everything that reads or writes a zone goes through `tree.ts`
   (`content` for `root:default-zone`, `zones["<parentId>:<zone>"]` otherwise), so the future
   slot migration touches one file.
4. **Two validators, on purpose.** `validateBlock` is STRICT for AI input (unknown/excluded
   types, unknown props, enums, URL schemes, `#hex` colours, ref ids, 32 KB). `validatePage`
   is LENIENT for whole pages (structure, unique ids, size caps, known types, URL schemes,
   refs) and ignores unknown props — legacy pages must stay editable. The security boundary is
   the SAVE path (`updateLandingPage`/`createLandingPage`/MCP writes), not the chat route.
5. **Links** are `/path`, `#anchor`, `?query`, `https:`, `mailto:`, `tel:` (never `//`,
   `javascript:`, `data:`); **images** are `https:` or `/`-relative. URL fields are found by
   key name (`*href`, `url`, `src`, `logo`, `avatar`, `*image`, `imageUrl`…), at any depth.
6. **Ref fields** (`ai.ref: course|product|plan|courseList|…`) accept a string/number or a
   `{id}[]`/`string[]` list; compare through `normalizeRefIds` (trimmed strings). The catalog
   normalises single refs to `"12"` and lists to `[{id:"12"}]` (the picker shape).
7. **Templates have a stable `id` slug** (`apply_template`, MCP `template_id`) and use
   bindings `{{courseId}}`, `{{productId}}`, `{{schoolName}}`, `{{year}}`, `{{logoUrl}}`.
   Always instantiate through core (`instantiateTemplate`/`templateToOps`/
   `deepCloneWithFreshIds`) — fresh ids everywhere, DropZone keys re-keyed onto the new
   parents, tokens substituted (unbound → neutral fallbacks). A raw `puck_data` copy leaks
   `{{schoolName}}` into the page.
8. **The catalog prompt doc has a budget** (≤6500 chars, `tests/unit/page-builder-catalog.test.ts`).
   Keep annotation instructions to one short sentence. Shared section fields (spacing, tone,
   align, anchorId, hideOn) go under `'*'` and are described ONCE; `*Color` props are
   described once in the header.
9. **After any block, annotation or template change, run `npm run gen:puck-fields`.** It
   writes the json-render manifest, the MCP mirrors AND the two core generated files;
   `page-builder-catalog`/`page-builder-templates` tests fail when they are stale.

## The json-render pipeline (legacy; retired by Page Architect WP7)

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

**A third flow (July 2026): MCP tools.** The MCP server exposes the same pipeline to external AI
agents via 8 admin-only tools (`lms_get_landing_blocks`, `lms_list/get/create/update_landing_page`,
`lms_publish/unpublish/delete_landing_page` in `mcp-server/src/tools/landing-pages.ts`). Because
mcp-server is built/deployed standalone (Docker context = `./mcp-server`), it cannot import
`lib/json-render/*`; instead `npm run gen:puck-fields` ALSO emits generated mirrors into
`mcp-server/src/landing/` (`puck-fields.generated.ts` + `catalog-meta.generated.ts` from
`catalog-meta.ts`/`LANDING_PAGE_CRAFT_GUIDE`), and `mcp-server/src/landing/{from-puck-fields,to-puck}.ts`
are kept-in-sync copies of the same-named lib files. **After changing any Puck block or the
descriptions, re-run `npm run gen:puck-fields` — it updates both surfaces.** If you edit
`lib/json-render/from-puck-fields.ts` or `to-puck.ts`, apply the same change to the mcp-server copy.

## Map of the system

| File | Role |
|---|---|
| `lib/puck/config.ts` | **Single source of truth.** All Puck blocks (`ComponentConfig`) + categories. |
| `lib/puck/components/**` | The block implementations (`fields`, `defaultProps`, `render`). |
| `scripts/gen-puck-fields-manifest.ts` | Codegen: reads `puckConfig`, emits the JSON manifest. |
| `lib/json-render/puck-fields.generated.json` | **Generated** pure-data manifest (`fields` + `defaultProps` + category). Never hand-edit. |
| `lib/json-render/from-puck-fields.ts` | `puckFieldsToZod()` — turns a block's Puck `fields` into a Zod schema. |
| `lib/json-render/catalog.ts` | Builds the json-render catalog from the manifest. Exports `landingCatalog`, `CATALOG_COMPONENT_NAMES`, `DEFAULT_PROPS_BY_TYPE`. Descriptions/exclusions come from `lib/puck/ai-annotations/` via `catalog-meta.ts`. |
| `lib/json-render/authoring-guide.ts` | `LANDING_AUTHORING_GUIDE` — the landing-specific prompt suffix (output shape + how to build a good page). Shared by the route and the test script. |
| `lib/json-render/to-puck.ts` | The bridge: `arraySpecToSpec`, `normalizeSpec`, `specToPuckData`. |
| `app/api/landing/generate/route.ts` | The endpoint: auth + tenant scope → `streamText`/`generateText` + `Output.object` on the school's own model (`createTenantAi`, feature `landing_builder`) → validate → Puck Data. |
| `components/admin/landing-page/ai-chat-panel.tsx` | The current AI chat Sheet (hand-rolled NDJSON, whole-page `setData`); replaced by the docked Page Architect panel (WP2). |
| `scripts/json-render-live-test.ts` | Offline end-to-end test with a REAL model call on YOUR OWN OpenAI key (`JSON_RENDER_TEST_OPENAI_KEY`). |

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
3. **Add an AI annotation** for it in `lib/puck/ai-annotations/` (the file your area owns;
   `base.ts` for general blocks): one short `instructions` sentence on when to use it, plus
   `fields` entries for `ref` ids, `required` fields or a field that needs guidance. A
   structural/primitive block humans compose layouts with gets `exclude: true`. Then re-run
   `npm run gen:puck-fields` and check the prompt-doc budget test.
4. **(Optional) Tune the flow.** If it should appear in the default page flow, mention it in
   `LANDING_AUTHORING_GUIDE` (`lib/json-render/authoring-guide.ts`).
5. **Verify:** `npx tsc --noEmit` (0 errors) and run the live test below.

## Testing

**Fast, offline, real model call** (proves the exact logic the button runs, minus HTTP/auth):
```bash
npx tsx scripts/json-render-live-test.ts "A landing page for <whatever>"
```
Requires `JSON_RENDER_TEST_OPENAI_KEY` (your own OpenAI key; the platform holds none) in `.env.local`. It prints the generated block list, runs
`catalog.validate`, and dumps the Puck `Data`. A healthy run shows 6–9 blocks opening with
HeroBlock and closing with CtaBanner.

**Full UI flow** (admin only): in the Puck editor, open the AI chat panel → type a prompt →
the result injects live via `dispatch({type:'setData'})` (Page Architect: streamed ops). The landing builder has **no plan
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
