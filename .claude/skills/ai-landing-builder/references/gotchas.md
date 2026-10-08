# Page Architect: the why behind each invariant

Long-form companion to SKILL.md. Each entry: symptom, root cause, the fix in place.

## 1. Server bundling — why the generated manifest exists

**Symptom:** `npm run build` fails inside Next's RSC resolver (`rsc.mjs`).

**Root cause:** `lib/puck/config.ts` imports every block, and blocks import `@measured/puck`
(`DropZone` and the editor tree). Pulled into a server route or into `packages/core`, that
client-only tree cannot be resolved server-side.

**Fix:** `scripts/gen-puck-fields-manifest.ts` runs under `tsx` (where importing `puckConfig` is
fine), strips everything non-serializable, folds in `lib/puck/ai-annotations/` and the
templates, and writes `packages/core/src/page-builder/generated/*.generated.ts`. The core, the
route and mcp-server read only those. `lib/puck/config.ts` stays the single source of truth.

## 2. defaultProps backfill — why blocks crashed on undefined arrays

**Symptom:** `Cannot read properties of undefined (reading 'length')` inside a block's `render`.

**Root cause:** Puck's `Render` does not reliably apply `defaultProps` for top-level props, and a
model often omits a list it does not want to fill.

**Fix:** every `add` (core `applyOps`, the editor's `applyOpToPuck`, MCP) merges the block's
generated `defaultProps` under the model's props, and `array-defaults.ts` fills array items.
Consequence: every array block must declare a populated array in `defaultProps`, and guard
`render` with `?? []` for pages saved before a field existed.

## 3. Why there is no `duplicate` op

Puck's `duplicate` action mints its own id, and `replace` refuses to change an id, so the
server could not know the new block's id and later ops could not target it. The server expands
a duplicate into explicit `add` ops with server-assigned ids (`expandDuplicate`), DropZone
children included.

## 4. Strict tool schemas and open `props`

OpenAI strict structured output rejects `z.record` and `.optional()`. Page Architect does not use
structured output: tools take an open `props` object and run with `strict` off; Anthropic and
Google take the raw JSON schema. If a provider ever drops the open object, add it to
`PROPS_JSON_PROVIDERS` (`lib/page-builder/agent.ts`) and the tools take `propsJson: string`
instead, parsed by an inner scanner.

## 5. Streaming tool arguments

`add_block`'s arguments arrive as JSON text deltas. `PartialJsonScanner` reads each character
once; a value counts as complete only after its closing quote AND the next `,`/`}`/`]`. Once
`type` is complete and allowed, a provisional `add` goes out; text fields stream as `appends`
(≤1 op per 50 ms per block); URLs, ids, enums and colours never stream. The final validated
props replace everything with one `update`, and an invalid final input removes the provisional
block. Key order the model is told to use: `type` → position → `props`.

## 6. One undo step per turn

Every AI dispatch uses `recordHistory:false`; at the end the turn dispatches one recorded `setUi`
(only if something applied) and waits for Puck's 250 ms history debounce before unlocking. A
`set`/`setData` that the turn did not send (a human undo/redo) aborts the turn without a commit.
Puck rebuilds its store when its props change identity, so `overrides`, `onAction`, `onChange`,
`permissions` and viewports must be stable.

## 7. Save is the boundary

The chat route accepts the editor's unsaved page (lenient check, size cap) because the admin
can already put anything in it by hand. `createLandingPage`/`updateLandingPage` and MCP writes
re-validate the whole page, refuse another school's ids, and save with `.eq('updated_at', …)`
so the editor and an MCP agent cannot overwrite each other silently.
