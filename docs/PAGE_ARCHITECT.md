# Page Architect

Page Architect is the AI that builds and edits a school's landing pages. The admin chats in a
panel docked beside the Puck editor, and the page changes on the canvas as the model works:
blocks appear, text types itself in, sections move. A whole AI turn is one undo step. External
agents get the same abilities through MCP tools.

Design history and the reasoning behind each decision: `docs/PAGE_ARCHITECT_DESIGN.md` (read
its "Critique & corrections"; a correction wins over the body). This file describes what ships.

## How it works

```
admin types in the panel
  │  useChat → POST /api/landing/chat  {messages, pageId, pageData (live, unsaved), selectedId, locale}
  ▼
route: auth → admin → paid plan → school's model (BYOK, tools) → limiter → body/page checks
       → JWT tenant → page row → history → daily usage → stream
  │
  ▼  createPageAgent: ShadowPage(pageData) + edit tools + data tools + system prompt
streamText (≤25 steps, one tool call at a time)
  │  each tool call is validated, applied to the shadow, and written as a transient
  │  `data-page-op` part; add_block streams while its arguments are still arriving
  ▼
editor: onData → PageArchitectTurn → OpQueue (one batch per animation frame)
       → applyOpToPuck (Puck dispatch, recordHistory:false)
       → at turn end, ONE recorded history entry
  │
  ▼  admin clicks Save → updateLandingPage re-validates the whole page (the security boundary)
```

Three ideas carry the design:

1. **The model edits; it never regenerates.** Tools change one block at a time on the page the
   admin has open, including unsaved edits. A human edit made before the turn is never lost.
2. **One op protocol, three appliers.** The same six ops run as Puck `dispatch` in the editor,
   as `applyOps` on the server's shadow page, and as `applyOpInPlace` on stored JSON in MCP.
   All three live in, or read from, `@lms/core` (`packages/core/src/page-builder/`).
3. **Save is the boundary.** The chat route trusts the editor's page as content only (lenient
   check, size cap). `createLandingPage`/`updateLandingPage` and every MCP write validate the
   full page, check that every course/product/plan id belongs to the school, and save with a
   compare-and-swap on `updated_at`.

## The op protocol

`packages/core/src/page-builder/ops.ts` (zod `pageOpSchema`):

| Op | Shape | Puck action |
|---|---|---|
| `add` | `{op:'add', id, type, zone, index, props}` | `insert{id}` then `replace` with `{...defaultProps, ...props}` |
| `update` | `{op:'update', id, props?, appends?}` | `replace` (props merged; `appends` add text to the end of a field) |
| `updateRoot` | `{op:'updateRoot', props?, appends?}` | `replaceRoot` |
| `move` | `{op:'move', id, zone, index}` | `move` |
| `remove` | `{op:'remove', id}` | `remove` |
| `reset` | `{op:'reset', root?}` | `setData` to an empty page (templates on a non-empty page) |

- `zone` is `root:default-zone` (`ROOT_ZONE`, the page's top level) or `<parentId>:<zoneName>`
  for a DropZone. Every zone read or write goes through `tree.ts`.
- `appends` maps a field path (`title`, `items[2].answer`) to text to add at the end. This is
  how text appears to type itself while the model is still writing the tool call.
- **There is no `duplicate` op.** Puck's `duplicate` creates its own id, so the server expands
  a duplicate into explicit `add` ops (`expandDuplicate`). Block ids are always assigned by the
  server (`<Type>-<random>`); ids a model invents are ignored.
- `applyOps` never throws: an op it cannot apply is skipped with a warning.

### Stream parts (`PageBuilderDataParts`)

| Part | Payload | Client |
|---|---|---|
| `data-page-op` (transient) | a `PageOp` | checked with `pageOpSchema`, queued, applied |
| `data-theme-preview` (transient) | `{preset, primary}` (`#RRGGBB`, upper case) | re-scopes the canvas's CSS variables; "Apply theme" calls `applyKitTheme` |
| `data-turn-status` | `{label, toolCallId?, error?}` | live status line (declared, not emitted by the server today) |

Errors use the standard AI body `{error:{code, feature:'landing_builder', canConfigure, settingsUrl}}`
with 402/424/422/429/502, before the stream or as the stream's error text, so
`parseAiChatError` reads both. Refusals that are not AI errors return `{code}`: 400
`invalid_body`/`invalid_page`/`invalid_messages`, 403 `admin_only`/`plan_required`, 404
`page_not_found`, 409 `tenant_mismatch`, 413 `page_too_large`, 429 from the chat-usage helpers.

## Server (`lib/page-builder/`)

| File | Role |
|---|---|
| `agent.ts` | `createPageAgent`: shadow page, tools, approval policy, prompt. `stream()` runs `streamText` (`stopWhen` 25 steps, parallel tool calls off for OpenAI/Anthropic, Langfuse metadata, `reportStreamError`). |
| `edit-tools.ts` | `ShadowPage`, `OpSink` (≤150 committed ops and ≤1500 streaming ops per turn), and the edit tools. |
| `partial-stream.ts` | `PartialJsonScanner` and `AddBlockStream`: turn the arriving JSON of an `add_block` call into a provisional `add`, `appends` and a final `update`. |
| `context.ts` (server-only) | Tenant-filtered reads on the admin client: page row, school profile, courses/products/plans, the id sets that bound refs are checked against. `formatBusinessContext` builds the `<tenant_data>` block (≤3k chars). |
| `data-tools.ts` (server-only) | Read-only tools over the landing-data resolvers. |
| `system-prompt.ts` | Two system messages: a static one (rules, block catalog, templates, presets; cached) and a per-turn one (page language, `<tenant_data>`, page outline, selected block). |

Route: `app/api/landing/chat/route.ts`. The AI feature is `landing_builder` (needs `tools`).
It runs on the school's own key through `createTenantAi`; there is no platform key. The panel
is shown on paid plans only, and the route enforces the same rule.

### Tools

| Tool | Does |
|---|---|
| `get_page({id?})` | Page outline with block ids, or one block's props |
| `list_templates` | Templates with their page type and block order |
| `apply_template({templateId, bindings})` | Replaces the page with a template, binding `courseId`/`productId` (and the school's name and logo) |
| `insert_preset` | Inserts a ready-made group of sections |
| `add_block({type, position, props})` | Adds one block; streams while its arguments arrive |
| `update_block`, `move_block`, `remove_block`, `duplicate_block` | Edit one block |
| `set_page_meta` | Page settings (SEO), checked with `validateRoot` |
| `preview_theme({preset, primary})` | Shows a school theme on the canvas; nothing is saved |
| `list_courses`, `get_course`, `list_products`, `list_plans`, `get_school_profile` | Read the school's data (lesson titles only, never lesson content) |

Every block the model writes is checked strictly (`pageCatalog.validateBlock`: known type,
known props, enums, safe URLs, `#hex` colours, ref ids that belong to this school). Tool
outputs are `{ok:true, …}` or `{ok:false, errors}`.

**Approvals.** `apply_template` on a non-empty page and `remove_block` once a turn would remove
3 or more blocks ask the admin first. The panel shows a confirmation card; the answer is sent
back with `lastAssistantMessageIsCompleteWithApprovalResponses`, and approval requests are
signed so a client cannot forge one.

## Client (`components/admin/landing-page/page-architect/`)

| File | Role |
|---|---|
| `page-architect-panel.tsx` | The docked chat (ai-elements): messages, one line per tool call, approval cards, example prompts, the selected-block chip, "N changes applied · Undo". |
| `use-page-architect.ts` | `useChat` with a transport that reads the live editor state at send time. Sends the last 20 messages, starting at a user message. |
| `turn.ts` | `PageArchitectTurn`: applies ops with `recordHistory:false`, then writes one history entry if anything applied. A human undo/redo during a turn stops the chat and commits nothing. |
| `op-queue.ts` | Applies ops once per animation frame, in order; types long text that arrived whole one chunk per frame (off under reduced motion). |
| `apply-op-to-puck.ts` | Maps one op to Puck dispatches; finds the block's current position by id right before each dispatch. |
| `page-architect-context.tsx` | Turn lock, dirty flag, theme preview state; stable Puck props. |
| `theme-preview.tsx` | Canvas theme preview and the "Apply theme" bar. |

The editor (`puck-editor.tsx`) mounts the panel through `overrides.puck`, keeps Puck's own
header, locks editing while a turn runs, and on save passes the `updated_at` it loaded. A
conflict asks "Reload theirs" or "Overwrite with mine".

## Templates and presets

Templates live in `lib/puck/templates/` and are generated into the core by
`npm run gen:puck-fields`. Each has a stable `id`, a `pageType` and bindings:
`{{courseId}}`, `{{productId}}`, `{{courseIds}}` (a list entry that expands into one entry per
course of a product), `{{schoolName}}`, `{{year}}`, `{{logoUrl}}`. Always instantiate through
core (`instantiateTemplate`, `templateToOps`, `deepCloneWithFreshIds`) so ids are fresh and
tokens are filled. Course-focused templates: `course-landing`, `course-launch-short`,
`free-course-lead`, `product-bundle`, `pricing-page`. Presets (groups of sections) are
`PRESETS` in `packages/core/src/page-builder/templates.ts`.

**Language.** Templates are written in English; `bindings.locale` (`'en' | 'es'`) translates
their copy before tokens are filled, from the exact-match dictionary
`packages/core/src/page-builder/template-copy-es.ts`. The picker passes the admin's locale, the
AI its page locale, MCP `bindings.locale`. Only copy keys are translated (`isCopyKey`: never
hrefs, images, ids or select/radio values). `page-builder-template-i18n.test.ts` fails when a
template string has no Spanish entry: add it to the dictionary when you change template copy.

**Start from a description.** On paid plans the picker's template step offers "Describe your
page": it creates an EMPTY page (so `apply_template` needs no approval) and the editor's chat
sends the description as its first message. The editor hands the prompt out once
(`takeInitialPrompt`), because Puck remounts the override tree while it boots.

Data blocks (`CourseHero`, `CourseCurriculum`, `CourseOutcomes`, `CoursePricingCard`,
`ProductGrid`, `InstructorCard`, plus bound `PricingTable`/`EnrollCta`/`TestimonialGrid`)
render the school's real data from the ids they hold. Templates never contain invented prices,
reviews, people or figures.

## MCP tools

`mcp-server/src/tools/landing-pages.ts`, admin only (teachers are denied in
`src/tool-policy.ts`). They use the same core catalog, ops and validation as the web editor.

| Tool | Does |
|---|---|
| `lms_get_landing_blocks` | Platform rules, op format and the block catalog |
| `lms_list_landing_templates({page_type?})` | Templates and presets |
| `lms_get_landing_context` | School profile, courses, products (with course ids), plans, pages |
| `lms_list_landing_pages`, `lms_get_landing_page({page_id})` | Pages; one page's outline, props and `updated_at` |
| `lms_create_landing_page({title, slug?, template_id? \| elements?, bindings?})` | New page (free plan: 1 page) |
| `lms_patch_landing_page({page_id, expected_updated_at?, ops})` | Up to 150 agent ops, all-or-nothing |
| `lms_insert_landing_preset({page_id, preset_id, after_id? \| index?, bindings?})` | Insert a preset |
| `lms_update_landing_page({page_id, title?, slug?})` | Rename / change slug only |
| `lms_publish_landing_page`, `lms_unpublish_landing_page`, `lms_delete_landing_page` | Lifecycle |
| `lms_list_plans` | The school's plans |

Agent ops (`agentOpSchema` in `mcp-server/src/landing/page-builder.ts`) use a friendlier shape
than the wire ops: `{op:'add', type, props?, ref?, zone?, index?, after_id?}`,
`{op:'update', id, props}`, `{op:'update_root', props}`, `{op:'move', id, …}`,
`{op:'remove', id}`, `{op:'duplicate', id, ref?}`. The server assigns ids; `ref` is a
temporary handle later ops in the same patch can target. Platform rules for external agents:
`mcp-server/skills/page-building/SKILL.md`.

## Adding a block

1. Write the Puck block in `lib/puck/components/**` and register it in `lib/puck/config.ts`.
   An array prop needs a populated array in `defaultProps` and a `?? []` guard in `render`.
   Internal links use `next/link`; the `Button` has no `asChild`.
2. Add its AI annotation in `lib/puck/ai-annotations/` (`base.ts`, `course-blocks.ts` or
   `style.ts`): one short `instructions` sentence, plus `fields` entries for ref ids
   (`ai.ref: 'course' | 'product' | 'plan' | 'courseList' …`), required fields, or a field that
   needs guidance. Layout primitives that humans compose get `exclude: true`.
3. Run `npm run gen:puck-fields`. It rewrites
   `packages/core/src/page-builder/generated/{manifest,templates}.generated.ts`. Never edit or
   hand-merge those files; re-run the script after every merge.
4. Run `npx vitest run tests/unit/page-builder-catalog.test.ts`. The catalog prompt doc has a
   budget (≤6500 characters); keep instructions short.
5. If the block shows data, resolve it in `lib/puck/utils/landing-data.ts` (tenant-filtered)
   and check its ids in the save validation (`app/actions/admin/landing-page-validation.ts`,
   `collectRefIds`).

Never import `lib/puck/config.ts` (or `@measured/puck`) from server code or from
`packages/core`: it pulls the client editor into the server bundle. Server code reads the
generated manifest.

## Testing

Unit tests (`npx vitest run tests/unit/<file>`):

| Area | Tests |
|---|---|
| Core | `page-builder-apply-ops`, `page-builder-appends`, `page-builder-catalog`, `page-builder-validate`, `page-builder-templates` |
| Server | `page-builder-partial-stream`, `page-builder-edit-tools`, `page-builder-context`, `page-builder-chat-route` (real AI SDK + `MockLanguageModelV4`: streamed ops, theme preview, route ↔ panel contract, refusal order, history trimming) |
| Client | `apply-op-to-puck`, `page-architect-op-queue` |
| Save + data | `landing-pages-save-validation`, `landing-data`, `landing-binding` |
| MCP | `cd mcp-server && npm test` (`src/tools/landing-pages.test.ts`) |

Not covered yet: a Playwright spec that mocks `/api/landing/chat` with a canned SSE body and
checks one Ctrl+Z per turn, the panel at 1280/1440px and the theme preview in light and dark;
and a provider matrix (OpenAI, Anthropic, Google) for streamed tool arguments.

Manual check: as `owner@e2etest.com` on a paid-plan school with an AI key set in
`/dashboard/admin/settings/ai`, open a page in `/dashboard/admin/landing-page`, ask
"Build a landing page for my course", watch the canvas, press Ctrl+Z once (the whole turn
goes), then Save.
