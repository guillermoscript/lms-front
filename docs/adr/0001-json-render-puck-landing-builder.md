# ADR 0001 — json-render as the AI generation layer for the Puck landing builder

- **Status:** Accepted (proof-of-concept implemented)
- **Date:** 2026-06-06
- **Supersedes the open question in:** `docs/AI_LANDING_PAGE_GENERATION.md` ("would need to be adapted to generate Puck-compatible `puck_data`")
- **Related:** `LANDING_PAGE_BUILDER.md`, `lib/puck/config.ts`

---

## Context

Creators (independent educators and schools) build landing pages in our **Puck v0.20 visual editor** — a human, drag-and-drop tool backed by `landing_pages.puck_data` (JSONB). We have **21+ Puck components** in `lib/puck/config.ts`, several now sourced from shadcn registries (Tailark, Magic UI) and hand-wrapped as Puck blocks.

Two unmet needs:

1. **The blank-page problem.** Most creators are not designers/copywriters. They want to describe their school in a sentence and get a real, on-brand page — then tweak it.
2. **The "simple change by myself" need.** Whatever AI produces must land in the **same Puck editor** so a creator can drag, reorder, and edit any block without touching code or re-prompting.

The requirement, stated plainly: **AI generates the page; Puck refines it; both use one shared component vocabulary.**

## Decision

Adopt **[json-render](https://json-render.dev)** (`@json-render/core`, `@json-render/react`) as the **AI generation layer** that sits *in front of* Puck — not as a replacement for it.

json-render's model maps almost 1:1 onto what we already built by hand:

| json-render concept | Our existing equivalent |
|---|---|
| **Catalog** (typed component vocabulary + AI descriptions) | `lib/puck/config.ts` component `fields` + labels |
| **Schema** (JSON UI grammar) | Puck's saved `Data` shape |
| **Registry / Renderer** (type → React) | each Puck wrapper's `render` fn + `puck-page-renderer.tsx` |
| **`catalog.prompt()`** (LLM system prompt) | (did not exist — this is the new capability) |
| **`catalog.validate()`** (anti-hallucination) | (did not exist — this is the new capability) |

So json-render gives us the **two things Puck alone cannot**: a catalog-constrained LLM prompt, and runtime validation that the model can only emit components we actually have.

### Architecture

```
creator types a sentence
        │
        ▼
POST /api/landing/generate
        │  landingCatalog.prompt()  ── constrains the LLM to our blocks
        ▼
   LLM → json-render spec  (flat: root + elements map)
        │  normalizeSpec()          ── fill required structural fields
        │  landingCatalog.validate()── REJECT unknown components / bad props
        ▼
   specToPuckData()                 ── the bridge (lib/json-render/to-puck.ts)
        ▼
   Puck `Data`  ──▶  opens in the existing Puck editor for human refinement
        ▼
   saved to landing_pages.puck_data
```

The **keystone is the bridge** (`specToPuckData`): json-render specs and Puck `Data` are both "component type + props" trees, so conversion is a flatten + pass-through. We deliberately keep catalog component **names and prop shapes identical to the Puck components**, which keeps the bridge trivial and means one definition feeds both flows.

## What was built

- `lib/json-render/from-puck-fields.ts` — `puckFieldsToZod()`: converts a Puck `fields` definition into a Zod schema (text/textarea/number/radio/select/array incl. nested). All props nullable+optional so partial AI output validates and falls back to Puck `defaultProps`.
- `scripts/gen-puck-fields-manifest.ts` + `lib/json-render/puck-fields.generated.json` — a **pure-data field manifest** derived from `lib/puck/config.ts`. The catalog imports this JSON instead of `puckConfig` (see "Server bundling" below). Regenerate with `npm run gen:puck-fields`.
- `lib/json-render/catalog.ts` — catalog **auto-derived for all 30 generatable components** (39 total minus 9 EXCLUDED structural/primitive blocks). AI descriptions live in a `DESCRIPTIONS` map (the one thing not derivable from Puck).
- `lib/json-render/to-puck.ts` — `normalizeSpec()` + `specToPuckData()` bridge.
- `app/api/landing/generate/route.ts` — auth + tenant-scoped endpoint: prompt → `generateObject` → `catalog.validate()` → Puck Data.
- `components/admin/landing-page/generate-with-ai.tsx` — **"Generate with AI" button + dialog**, wired into the Puck editor's `headerActions`. Calls the endpoint and injects the result via `dispatch({ type: 'setData', data })` so the generated page opens live in the editor for refinement. i18n keys under `puck.ai` (en/es).
- `scripts/json-render-proof.ts` — runnable proof (`npm run json-render:proof`).

### Server bundling — why a generated JSON manifest

The catalog runs in a **server context** (the API route). Importing `lib/puck/config.ts` there bundled the entire client Puck editor tree — including `DropZone` from `@measured/puck` — into the server build, which **fails** under Next's RSC resolver (`rsc.mjs`). Fix: a build-time script reads `puckConfig` (fine under tsx) and emits `puck-fields.generated.json` (plain data, no React imports); the catalog imports the JSON. `lib/puck/config.ts` remains the single source of truth; the manifest is a derived artifact.

**Verified:** `npm run build` succeeds with `/api/landing/generate` in the route list; `npx tsc` 0 errors; the proof shows a valid spec accepted, a **hallucinated component rejected**, and a clean conversion to a Puck page (`HeroBlock → StatsBand → CtaBanner`). The "Generate with AI" button appears in the editor header.

## Consequences

### Positive
- **Blank-page problem solved** without a new editing UX — output opens in Puck.
- **One vocabulary, two flows.** Every shadcn block we wrap becomes usable by *both* the human editor and the AI generator.
- **Safety by construction.** `catalog.validate()` makes it impossible to render a component we don't have; tenant/auth checks live in the route.
- **Future optionality.** json-render renderers can target PDF (`@react-pdf/renderer` already in deps), email (Mailgun already in deps), etc. from the *same* spec — relevant for certificates and marketing emails later.
- **Data binding path.** `{"$state": "/courses"}` is the eventual mechanism for live-data blocks (e.g. `CourseGrid` bound to the tenant's real published courses) instead of hardcoded queries per block.

### Negative / risks
- **Young framework.** json-render is early; adopting it as core infra is a bet. Mitigated by: it's only the *generation* layer — Puck remains the source of truth, and `@json-render/codegen` can export static React if we ever exit.
- **Two definitions to keep in sync.** A block must be declared both as a Puck `ComponentConfig` and a catalog entry. Mitigated by identical naming and a future codegen step that derives the catalog from the Puck config.
- **API quirks vs. docs.** Validation is `catalog.validate(spec)` returning `{success,error}` (Zod), not the documented `validateSpec(spec,{catalog})`; every element requires `children` + `visible` (hence `normalizeSpec`). Captured here so the next person doesn't relearn it.
- **Skill install blocked.** `npx skills add vercel-labs/json-render@*` was denied by the agent sandbox (untrusted third-party code). Not required — the npm packages are sufficient.

## Alternatives considered

1. **Generate Puck `Data` directly from an LLM** (no json-render). Simpler stack, but we'd hand-build the constrained prompt *and* a validator — i.e. reinvent json-render's catalog, with no validation guarantees and no multi-target future.
2. **Free-form code generation (Syntux-style).** Maximum flexibility, but unsafe (arbitrary code), not editable in Puck, and off-brand. Rejected — see `AI_LANDING_PAGE_GENERATION.md`.
3. **Replace Puck with json-render's editor.** Loses the mature human editing UX creators rely on. Rejected — the whole point is to *keep* Puck for the "simple change by myself" case.

## Next steps

- [x] Expand the catalog to all generatable components (30) — done via auto-derivation.
- [x] "Generate with AI" entry point wired into the editor (`dispatch({type:'setData'})`).
- [x] Codegen the field shapes from `lib/puck/config.ts` (the JSON manifest) — removes the dual-definition risk for props; descriptions are still hand-authored.
- [ ] **Hook the manifest regen into precommit/CI** so `puck-fields.generated.json` can't go stale when a component's fields change.
- [ ] Switch the endpoint to **streaming** (`useUIStream`) so the page builds progressively.
- [ ] Introduce `$state` data binding for dynamic blocks (`CourseGrid`, pricing) against tenant data.
- [ ] Visual QA in the live editor as an admin (button → dialog → generated page renders).
```
