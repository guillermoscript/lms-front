# AI Landing Page Generation — Design Document

> **Note:** This document describes a planned AI generation approach for the **old section-based landing page builder**, which has been replaced by the **Puck v0.20 visual editor** (see `LANDING_PAGE_BUILDER.md`). The concepts here would need to be adapted to generate Puck-compatible `puck_data` JSON instead of `sections[]` arrays. The current landing page system uses `landing_pages.puck_data` (JSONB column) with 32 Puck components across 4 categories.

Status: **Brainstorm / Pre-implementation**
Target plans: Starter and above (same gate as the builder)

---

## Problem

School admins face a blank page when creating a landing page. Most are not designers or copywriters — they want to ship their school fast. The section editor solves the *editing* problem but not the *starting* problem. A prompt-driven generator removes the blank page.

---

## Goal

Given a short prompt from the admin, generate a complete, ready-to-edit landing page:
- Appropriate sections selected and ordered
- On-brand copy written for their context
- Layout variants and color palette chosen to match the vibe
- Result is immediately editable in the existing section editor — no new UX needed

---

## Approach: Level 1 + Level 2 (recommended)

After evaluating options inspired by [Syntux](https://github.com/puffinsoft/syntux), we landed on a pragmatic path that maximizes value with minimal new infrastructure.

### Why not full free-form generation (Syntux-style)?

Syntux generates a free-form component tree from an LLM, which produces truly unique layouts. The problem is editability: once the layout is free-form, you need inline editing (click-to-edit, drag handles, spacing controls) — essentially building a mini Webflow. That is a multi-month project and overkill for users who mostly want good copy and a coherent structure.

Our users are school admins who want to ship. The value of AI is:
1. No blank page
2. Good, on-brand copy
3. Correct section selection for their use case

Not: pixel-perfect unique layouts.

### Level 1 — AI fills sections (ship first)

The AI generates a complete `sections[]` array using the existing 12 section types. Specifically:

- Selects which section types to include and in what order
- Fills all copy: headline, subtitle, CTA labels, feature titles, descriptions, FAQ items, testimonials, stats
- Chooses layout variants: `alignment`, `columns`, `style`, `imagePosition`, etc.
- Suggests a primary color that fits the prompt (optionally applied to the tenant)

Output is a valid `LandingSection[]` that gets saved directly to `landing_pages.sections`. The admin sees a fully populated builder they can edit section by section.

**Complexity:** Low. No new components. Just a server action that calls the Claude API and saves the result.

### Level 2 — Section variants (adds visual variety)

Each section type gains visual variant options that go beyond the current layout fields:

| Section | New variants |
|---------|-------------|
| `hero` | `centered` / `split-left` / `split-right` / `full-bleed` |
| `features` | `card-grid` / `icon-list` / `timeline` / `comparison-table` |
| `testimonials` | `cards` / `wall` / `single-large` / `carousel` |
| `cta` | `banner` / `split` / `minimal` |
| `stats` | `inline` / `big-numbers` / `with-icons` |

The AI picks the variant. The section renderer handles each variant. The editor shows a variant selector so the admin can swap after generation.

**Complexity:** Medium. New renderer code per variant, new editor UI for variant switching. No new data model changes.

---

## Data Flow

```
Admin types prompt
       ↓
POST /api/generate-landing-page (or server action)
       ↓
Build system prompt with:
  - Tenant name, plan, primary color
  - Available section types + their fields (typed schema)
  - Available variants per section
  - Admin prompt
       ↓
Claude claude-sonnet-4-6 generates sections[] JSON
       ↓
Validate + sanitize output
       ↓
Save to landing_pages table as new draft
       ↓
Redirect admin to builder with the generated page open
       ↓
Admin edits, saves, publishes
```

---

## Prompt Design

### System prompt (sent once, cached)

```
You are a landing page copywriter and designer for online schools.
You generate landing page configurations as structured JSON.

Available section types: hero, features, courses, testimonials, faq, cta, stats,
text, image_text, video, pricing, team.

Rules:
- Always start with a hero section
- Always end with a cta section
- Include 3-6 sections total (don't overwhelm)
- courses and pricing sections need no content (auto-populated from DB)
- Write copy that is specific to the school's niche — avoid generic filler
- Match tone to the prompt (professional, playful, intense, etc.)
- Return ONLY valid JSON — an array of LandingSection objects

[Full TypeScript interface definitions for each section type]
```

### User prompt (per generation)

```
School name: {{ tenant.name }}
Niche / description: {{ admin_prompt }}
Primary color: {{ tenant.primary_color }}
Existing products (optional): {{ product_names }}

Generate a complete landing page for this school.
```

---

## Caching Strategy

- Generated `sections[]` is saved to the DB immediately — the AI is called once
- Re-generation is explicit (a "Regenerate" button, not automatic)
- Admins can edit the result without triggering another AI call
- This is identical to how templates work today — AI is just a smarter template

---

## UX Flow (admin)

1. On the landing page list, add an **"Generate with AI"** button alongside "Create from Template"
2. A small modal asks for a prompt: *"Describe your school in a sentence or two"* with a textarea and optional tone selector (Professional / Playful / Intense / Minimal)
3. Spinner while generating (~3-5 seconds for a full page)
4. Builder opens with the generated page as a new draft named *"AI Generated — [date]"*
5. Admin edits, saves, publishes as normal
6. No special AI state in the builder — it's just another draft

---

## Implementation Plan (when ready to build)

### Step 1 — Server action
`app/actions/admin/generate-landing-page.ts`
- Accept `{ tenantId, prompt, tone }`
- Build system + user prompt
- Call `anthropic/claude-sonnet-4-6` via AI SDK with `generateObject` (typed schema validation)
- Validate output against `LandingSection[]` Zod schema
- Insert into `landing_pages` as draft
- Return new page ID

### Step 2 — Zod schema for generation
`lib/landing-pages/generation-schema.ts`
- Zod schema mirroring the section types
- Used with AI SDK `generateObject` to enforce structured output
- Prevents hallucinated fields or invalid section types

### Step 3 — UI
- "Generate with AI" button on the landing pages list
- Prompt modal component
- Loading state (optimistic: show spinner overlay)
- On success: `router.push` to builder with new page ID

### Step 4 — Level 2 variants (follow-up)
- Add `variant` field to section data types
- Update each section renderer to handle variants
- Add variant picker to section editors
- Update generation schema to include variant selection

---

## Technical Notes

- Use `generateObject` from `@ai-sdk/anthropic` (not `generateText`) — structured output ensures valid JSON every time
- The section schema passed to the LLM should include field descriptions to reduce hallucination
- `courses` and `pricing` sections: AI should include them but leave their `data` empty — they're auto-populated at render time
- Tone selector maps to a short instruction appended to the system prompt
- Generation cost estimate: ~2,000–4,000 tokens per page (~$0.003–$0.006 with Sonnet 3.5)

---

## What We Explicitly Are Not Doing

- **Free-form layout generation** — too complex to make editable, overkill for the user base
- **Streaming UI generation** (Syntux-style) — generation takes 3-5s total, streaming a landing page section by section adds complexity without clear UX value
- **Auto-regeneration** — AI is called once on explicit user request, never automatically
- **Design token generation** — we respect the tenant's existing `primary_color`, we don't override their brand
- **Inline AI editing** ("make the hero more dramatic") — v2 consideration after validating the basic flow

---

## Open Questions

1. Should tone be a free-text field or a fixed set of options? Fixed is safer for prompt engineering.
2. Do we show a preview before saving, or save immediately as draft? Saving as draft is simpler and less risky.
3. Should "Regenerate" replace the current draft or create a new one? New draft is safer (non-destructive).
4. Should the AI be able to suggest a new `primary_color`? Could be a nice touch but needs admin confirmation before applying.
