---
name: ai-landing-builder
description: >-
  How the AI landing-page builder (Page Architect) works in this LMS — the chat panel docked in
  the Puck editor, the /api/landing/chat agent route and its tools, the op protocol and shared
  core (`@lms/core` page-builder: ops, applyOps, catalog, validatePage, templates, presets), the
  AI annotation side-map, the data-bound course blocks, landing templates, the save-path
  validation and the MCP landing tools. Use this skill whenever the task touches AI page
  building, the editor's AI chat panel, `lib/page-builder/`, `lib/puck/ai-annotations/`, the
  Puck landing-page blocks, landing templates, `npm run gen:puck-fields`, or the
  lms_*_landing_* MCP tools — including adding a new block type, debugging a block that renders
  blank/crashes, changing what the AI is allowed to emit, or a streamed edit that lands in the
  wrong place. Reach for it even when the user just says "the landing page generator", "the AI
  page thing" or "Page Architect", since the pipeline has several non-obvious invariants that
  are easy to break without it.
---

# AI Landing-Page Builder (Page Architect)

Full guide: `docs/PAGE_ARCHITECT.md` (how it works, op protocol, tools, MCP tools, adding a
block, testing). Design history: `docs/PAGE_ARCHITECT_DESIGN.md` (its "Critique & corrections"
win over its body). Why each invariant exists: `references/gotchas.md`.

The AI edits the live page through a small **op protocol**: each tool call is validated on the
server, applied to a shadow copy, streamed to the editor as a transient `data-page-op` part and
applied there with ONE undo step per turn. Save is explicit and is the security boundary.

## Map

| File | Role |
|---|---|
| `packages/core/src/page-builder/` | Shared core, exported from `@lms/core`. Pure TS + zod, React-free. Used by the web route, the editor applier, the save actions and mcp-server. |
| `…/ops.ts` | `PageOp` zod: `add`, `update` (+`appends`), `updateRoot`, `move`, `remove`, `reset`. `ROOT_ZONE = 'root:default-zone'`. `PageBuilderDataParts` (`page-op`, `turn-status`, `theme-preview`). |
| `…/apply-ops.ts` | `applyOps(data, ops, catalog) → {data, warnings, applied}` (bad ops skip with a warning), `applyOpInPlace`, `expandDuplicate`, `subtreeToAddOps`. |
| `…/tree.ts` | THE zone accessor (`getZone`/`setZone`/`zoneKeys`/`findNode`/`descendantIds`). |
| `…/appends.ts`, `array-defaults.ts` | Text streaming (`items[2].title` → tail) and array-item backfill. |
| `…/catalog.ts` | `pageCatalog`: strict `validateBlock`/`validateRoot`, `promptDoc()`, `streamableFields`, `jsonSchema`. |
| `…/validate.ts` | Lenient `validatePage`, URL/colour rules, `PAGE_LIMITS`, ref-id checks. |
| `…/bindings.ts`, `templates.ts` | `deepCloneWithFreshIds`, binding substitution, `instantiateTemplate`, `templateToOps`, `PRESETS`, `presetToOps`. |
| `…/outline.ts` | `formatOutline` — the compact page view for the model. |
| `…/generated/{manifest,templates}.generated.ts` | **Generated** by `npm run gen:puck-fields`. Never hand-edit or hand-merge. |
| `lib/puck/ai-annotations/` | The AI side-map: `base.ts`, `course-blocks.ts`, `style.ts`, merged in `index.ts`. `'*'` = shared section fields. |
| `lib/puck/templates/` | Templates (stable `id`, `pageType`, bindings). `school-bindings.ts` = school name/logo bindings. |
| `lib/page-builder/` | Server agent: `agent.ts`, `edit-tools.ts` (`ShadowPage`, `OpSink`, tools, approvals), `partial-stream.ts` (streamed `add_block`), `context.ts` + `data-tools.ts` (server-only, tenant-filtered), `system-prompt.ts`. |
| `app/api/landing/chat/route.ts` | The route. Feature `landing_builder` (needs `tools`), BYOK only, paid plans only. |
| `components/admin/landing-page/page-architect/` | Panel, `useChat` hook, `PageArchitectTurn`, `OpQueue`, `applyOpToPuck`, theme preview. |
| `app/actions/admin/landing-pages.ts`, `landing-page-validation.ts` | Save path: lenient `validatePage` + ref ownership + `updated_at` compare-and-swap. |
| `mcp-server/src/tools/landing-pages.ts`, `src/landing/page-builder.ts` | MCP tools on the same core; agent ops → core ops; all-or-nothing patches with `updated_at` CAS. |
| `scripts/gen-puck-fields-manifest.ts` | Codegen from `lib/puck/config.ts` + annotations + templates into the core generated files. |

## Invariants

1. **Never import `lib/puck/config.ts` (or `@measured/puck`) server-side or in `packages/core`.**
   It bundles the client editor tree into the server build and breaks `npm run build`. Server
   code reads the generated manifest; `ai-annotations` is pure data.
2. **Array props need a populated array in `defaultProps`** and a `?? []` guard in `render`.
   `add` ops merge `{...defaultProps, ...props}` (core `applyOps` and `applyOpToPuck`), and
   Puck's `Render` does not reliably backfill top-level defaults.
3. **No `duplicate` on the wire.** Puck's `duplicate` mints its own id and `replace` refuses an
   id change, so the server expands a duplicate into `add` ops. Block ids are server-assigned
   `<Type>-<random>`; ids a model proposes are ignored.
4. **One zone accessor.** Everything that reads or writes a zone goes through `tree.ts`
   (`content` for `root:default-zone`, `zones["<parentId>:<zone>"]` otherwise).
5. **Two validators, on purpose.** `validateBlock` is STRICT for AI input (unknown/excluded
   types, unknown props, enums, URL schemes, `#hex` colours, ref ids, 32 KB). `validatePage` is
   LENIENT for whole pages and ignores unknown props, so legacy pages stay editable. The
   security boundary is the SAVE path (`updateLandingPage`/`createLandingPage`/MCP writes), not
   the chat route.
6. **Links** are `/path`, `#anchor`, `https:`, `mailto:`, `tel:` (never `//`, `javascript:`,
   `data:`); **images** are `https:` or `/`-relative. URL fields are found by key name
   (`*href`, `url`, `src`, `logo`, `avatar`, `*image`, `imageUrl`…), at any depth.
7. **Ref fields** (`ai.ref: course|product|plan|courseList|productList|planList`) take a
   string/number or a `{id}[]`/`string[]` list; compare through `normalizeRefIds`. Ids must
   belong to the school (checked on the AI path and on save).
8. **Templates** use bindings `{{courseId}}`, `{{productId}}`, `{{courseIds}}` (a lone list
   entry expands into one entry per id), `{{schoolName}}`, `{{year}}`, `{{logoUrl}}`. Always
   instantiate through core (`instantiateTemplate`/`templateToOps`/`deepCloneWithFreshIds`):
   fresh ids, DropZone keys re-keyed, tokens substituted. A raw `puck_data` copy leaks
   `{{schoolName}}` into the page. Never put invented prices, reviews, people or figures in a
   template.
9. **The catalog prompt doc has a budget** (≤6500 chars, `tests/unit/page-builder-catalog.test.ts`).
   One short instruction sentence per block; shared section fields are described once under `'*'`.
10. **After any block, annotation or template change, run `npm run gen:puck-fields`**, and
    again after every merge. The catalog/templates tests fail when the generated files are stale.
11. **Editor ops never record history.** Every op dispatches with `recordHistory:false`; the
    turn writes ONE recorded entry at the end. Resolve a block's selector by id right before
    each dispatch (indexes move). Keep Puck props (`overrides`, `onAction`, `permissions`…)
    referentially stable, or Puck rebuilds its store mid-turn.
12. **Route check order:** auth → admin → plan → resolve model (402/424/422) → limiter → body →
    page size/shape → JWT tenant → page row → history → `checkAiChatUsage` (it increments, so
    it is last) → stream. History is capped at 20 messages and must start with a user message.

## Adding a block

See `docs/PAGE_ARCHITECT.md` "Adding a block": write the Puck block (populated array defaults),
add an annotation, `npm run gen:puck-fields`, run the catalog test, and resolve/validate any
data ids it binds.

## Debugging cheatsheet

- **`Cannot read properties of undefined (reading 'length')` in `render`** → an array block got
  `undefined`: add a populated array to `defaultProps`, guard with `?? []`, regenerate.
- **`npm run build` fails resolving `@measured/puck` / `rsc.mjs`** → something server-side
  imported `lib/puck/config.ts` (invariant 1).
- **AI says a block type/prop does not exist, or the catalog test fails** → stale generated
  files: `npm run gen:puck-fields`.
- **A streamed block lands in the wrong place or an op is skipped** → check the dev console
  for `[page-architect]` warnings (unknown id/zone/type); compare the server's shadow ops in
  `page-builder-chat-route`/`page-builder-edit-tools` tests.
- **Save fails with `invalid`** → `summarizeValidationErrors` lists the block; a course/product/
  plan id from another school or a malformed id is refused, a missing id passes.
- **Save fails with `conflict`** → someone (or an MCP agent) saved since the editor loaded;
  the editor offers reload or overwrite.
- **402/424/422 from `/api/landing/chat`** → the school has no key / an invalid key / a model
  without tool calling for `landing_builder` in `/dashboard/admin/settings/ai`.
