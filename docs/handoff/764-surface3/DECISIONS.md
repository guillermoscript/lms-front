# Surface 3 sweep — DECISIONS

Issue #764 surface 3 (epic #766), branch `refactor/staff-theme-tokens-764`.
Written by the orchestrator. **Sweeping agents do not re-open any of this.**
Where a group plan (`docs/handoff/764-surface3/plans/<GROUP>.md`) and this file disagree, **this file wins.**

---

## Part 1 — Doctrine

These twelve rules answer most judgment calls. Part 2 answers the rest by id.

**D1 — Decorative multi-hue tiles collapse to one brand tint.**
A row of stat cards whose icon tiles are blue / green / purple / amber *for decoration* becomes
`bg-brand-tint` + `text-brand-text` on every tile. The number and the label carry the meaning;
the hue never did. Precedent: #771 collapsed decorative gradients to a single token fill.

**D2 — …unless the metric IS a status.** A tile that counts a *state* — failed payouts, pending
requests, overdue invoices, revoked users — keeps that state's token (`success` / `warning` /
`destructive`). The test: could the number be bad news? If yes it is status; if it is just
"how many", it is D1.

**D3 — Status colour is the platform's, never the school's.** green/emerald/lime → `success`,
amber/yellow/orange → `warning`, red/rose → `destructive`. Every status keeps its icon or its
text label, so meaning never rests on hue.

**D4 — Two brand-ish states that collide separate by weight, not hue.** When two lifecycle
states both map to "brand", give them different fill weights — neutral (`bg-muted text-foreground`)
→ tint (`bg-brand-tint text-brand-text`) → solid (`bg-primary text-primary-foreground`) — rather
than reaching for a second hue. Never split them with a palette colour.

**D5 — Coloured text and icons use `brand-text`, never `text-primary` on a tint.**
`text-primary` on `bg-primary/10` fails AA for light brands (#762). `bg-primary/5` /
`border-primary/NN` / `ring-primary/NN` chrome that #770 kept may stay; the *ink* moves.

**D6 — A shared status vocabulary gets one module.** When two files in scope render the same
status set and already disagree, extract the map to a plain module under `lib/` and import it
from both. No back-compat shim, no re-export from a component.

**D7 — Delete, don't translate.** A className that only restates a component default
(`bg-card` on a `Card`, `text-muted-foreground` on a `CardDescription`, a `dark:` twin of a token,
`backdrop-blur` on what is now an opaque fill, a border colour with no border width) is removed,
not mapped. So is decoration that already does nothing.

**D8 — Bands are `bg-muted`, bordered raised panels are `bg-card`.** `--card` equals
`--background` on the no-kit platform default, so `bg-card` on a full-width band vanishes in
light mode.

**D9 — `text-muted-foreground` on a `bg-muted` fill is 4.39:1.** Where the text is the point —
and always at ≤12px — use `text-foreground`.

**D10 — No new tokens, no new CSS variables.** The palette is what #770 registered:
`background card muted foreground muted-foreground border input ring primary primary-foreground
secondary brand brand-text brand-tint success warning destructive (+ -foreground) chart-1..5`.

**D11 — Colour only.** Geometry, spacing, variants, props, copy and behaviour do not change.
The one exception is D7's deletions and a lookup map that becomes dead.

**D12 — Content stays hardcoded, with a comment that names no utility class.** Content is: a code
editor's syntax panel, a colour the *user* picked and is previewing, a scrim over an uploaded
image, a QR quiet zone. Everything else is chrome. Write "White initials over the template
colour", never "`text-white`: …" — the guard scans source text and a keep comment containing a
utility token banks a false allowance.

**D13 — A tinted `Badge` needs no dark twin.** *(Amendment, 2026-09-16, orchestrator.)* The outline
variant used to set its own dark-mode fill, and because a `dark:` class out-ranks a plain one, every
`bg-success/10`-style tint on an outline badge rendered as a neutral wash in dark mode — a bug
surface 1 shipped too (`exam-card.tsx`). The sweep agents patched it three different ways. The fix
now lives once in `components/ui/badge.tsx` (the outline variant's dark fill is gone; `--input` is
white at 15% in dark, so the default outline badge moves by ~1.5% lightness). Never add a
`dark:bg-<token>` twin to a Badge. The `Input`/`Button` primitives still carry theirs; a caller that
tints one of those must say why in a comment.

---

## Part 1b — Four cross-cutting shapes that recur in every group

**S1 — Stat cards.** Two shapes, two answers:
- icon inside a **tinted tile** (`h-9 w-9 … rounded-lg ${bg}`) → `bg-brand-tint` on the wrapper,
  `text-brand-text`, and the icon's own colour class deleted (Tabler icons inherit `currentColor`);
- a **bare icon** with no tile → `text-muted-foreground`, uniformly. This is the existing repo
  precedent (`app/[locale]/dashboard/admin/page.tsx:392`, comment "clean, no color noise").

Exception, and only this one: a tile whose metric **is a lifecycle state the admin acts on** —
pending, failed, expired, overdue — keeps that state's tint (`warning` / `destructive`). A tile
counting a cadence ("Monthly plans") or a plain total is never a status.

**S2 — Difficulty is already decided.** `easy / medium / hard` → `success / warning / destructive`
tints. Surface 1 shipped exactly this in `components/exercises/exercise-card.tsx:31-35` and
`exercise-header.tsx:25-38`. Do not re-litigate it per file.

**S3 — The brand chip border is `border-primary/20`** everywhere in surface 3. Surface 3 ships as
one PR; internal consistency beats matching one `/25` line merged in #771.

**S4 — Accent/section/step chips are `bg-brand-tint text-brand-text border-primary/20`.** Never map
a decorative chip by hue: that would stamp `warning` on "Design", `destructive` on "Completion
criteria" and `success` on a payment step the user has not completed yet.

---

## Part 2 — The 71 judgment calls

Format: **id → verdict**. "as recommended" means the surveyor's own recommendation stands.

### T1 — block editor
- **T1-1 → A.** All 23 `BLOCK_ICONS` entries become `text-brand-text` / `bg-brand-tint`. Keep the
  record shape and both fields — `sortable-block.tsx` reads them and is not in the file list (S4).
- **T1-2 → A.** The code editor's GitHub-dark panel is content and stays, with a keep comment.
  `components/lesson/code-block.tsx` is its learner twin and surface 1 kept it at `[9, 2]`; the two
  files must not disagree about the same panel. Baseline keeps `[8, 2]` (D12).
- **T1-3 → A.** Seven interactive-block accent cards → `bg-brand-tint` + `text-brand-text` (S4).
- **T1-4 → A.** Decorative amber and rose are brand accents, not `warning`/`destructive` (D3).
- **T1-5 → A.** `bg-primary text-primary-foreground` vs `bg-muted text-foreground` (D4, D5).

### T2 — grading
- **T2-1 → B.** AI panel `bg-brand-tint`; the teacher-override badge, editor and notes go neutral
  (`bg-muted/50 border-border`, `text-muted-foreground` icons, `text-foreground` headings). The two
  panels stack inside one card, so one tint would read as one region (D4).
- **T2-2 → A.** AI score `text-brand-text`, final score `text-foreground`. A percentage is data;
  painting 30% in `success` is the token misuse the next surface would copy (D2).
- **T2-3 → A.** Sweep all six `text-primary` sites to `text-brand-text` (D5).
- **T2-4 → A.** `text-warning` on the pending-queue tile (S1's exception: pending is actionable).
  The neutral pending badge below it is pre-existing; do **not** recolour the badge.
- **T2-5 → B.** Add the third arm: `isPendingReview ? 'border-l-border' : isCorrect ? …`.
  This is the one deliberate departure from D11 — the line is being rewritten anyway and today it
  pre-marks every ungraded free-text answer as wrong. Call it out in the PR body.

### T3 — teacher routes
- **T3-1 → (a).** Four revenue tiles → one brand tint; delete the `valueColor` key (D1).
- **T3-2 → (a).** Platform fee `bg-muted/40`, your revenue `bg-brand-tint` + `ring-primary/20` (D2).
- **T3-3 → (c).** Tokenise the bar, keep the markup, and flag the hardcoded `w-[65%]` as a
  follow-up. A colour sweep does not delete visible UI (D11).
- **T3-4 → (a).** `bg-success` presence dot.
- **T3-5 → (a).** Three per-tab category accents collapse to brand (D1).
- **T3-6 → (a).** `text-success` for a configured template, `text-muted-foreground` for none.
- **T3-7 → (d), not (c).** `shadow-[0_0_10px_rgba(var(--primary),0.5)]` is dead CSS — `--primary`
  is an `oklch()` value, so the `rgba()` never parsed and the glow has never rendered. **Delete the
  class** (D7) rather than reviving a shadow nobody has seen; raise a follow-up for the identical
  dead class in the already-merged `student/courses/[courseId]/page.tsx:219`. This keeps the sweep
  at zero rendered change on this line.
- **T3-8 → (a).** Leave `getExerciseIcon()`'s switch alone; change only the class string (D11).

### T4 — versioning and preview
- **T4-1 → Tokenize.** The diff body highlights nothing — it is plain text coloured only by
  add/remove state, so its `#1e1e2e` slab is decoration, and a fixed-dark surface would force
  every status token on it to stay hardcoded too. `bg-muted/40`, `text-foreground`,
  `text-muted-foreground`, plain `border-*`, and add/remove → `success`/`destructive`.
- **T4-2 → Tokenize.** Both prompt-preview panels → `bg-muted/40`. They are labelled "what the
  student sees" / "what the AI sees" — prose, not code — and `version-preview.tsx` already renders
  prompt source that way.
- **T4-3 → status triad** (S2).
- **T4-4 → add the icon.** The correct-exam-option row is the one status in the group carried by
  colour alone; "every status keeps its icon or its label" is this sweep's own rule.
- **T4-5 → Brand.** "Latest" is a highlight, not a caution (D3).
- **T4-6 → Warning.** In the diff panel green and red are already `success`/`destructive`, so amber
  completes a semantic triad. Same hue, opposite answer to T4-5 — that is correct, not a slip.
- **T4-7 → Warning.** The preview band exists to say "this is not the real thing". It is the one
  full-width band that must not be neutralised by D8.

### T5 — builders
- **T5-1 → A.** Delete the fake terminal shell around the AI system prompt and render it as the
  plain token-styled mono textarea `lesson-ai-task-step.tsx` already uses for the same field. A
  system prompt is English prose, not code. **This is a visible change** — say so in the PR body.
- **T5-2 → A.** "Hidden from students" is a neutral visibility chip, not a warning (D3).
- **T5-3 → A.** Difficulty → status triad (S2).
- **T5-4 → A.** `markdown-field.tsx`'s `TERMINAL` skin stays as classes with a keep comment;
  baseline becomes `[0, 13]`. **Do not** invent `--editor-*` CSS variables: they are not theme
  tokens, a future reader would mistake them for ones a school can override, and reaching zero that
  way is a detector bypass rather than a reviewed keep (D10, D12).
- **T5-5 → A.** File-type icon hues → `text-muted-foreground`; the glyphs carry the format (D1).

### T6 — certificates
- **T6-1 → A, not B.** Keep the certificate preview's fixed paper and ink as classes with keep
  comments; the baseline entry stays. It is a facsimile of a printed document (D12), and moving the
  same literals into `style={{}}` to reach a cosmetic zero is exactly the detector bypass T5-4
  rejects. Raise a follow-up: the mock prints `bg-white` + `gray-*` while
  `lib/certificate-generator.ts` prints `#fffef9` with `#3a3632`/`#8a8578` ink, so the "live
  preview" does not match the PDF.
- **T6-2 → `bg-brand-tint` + `text-brand-text` on all seven section chips** (S4).
- **T6-3 → `text-success`,** and delete the four dead `hover:` variants on a control that is
  `disabled` on the next line (D7).
- **T6-4 → `border-card`.**

### A1 — admin money
- **A1-1 → (a).** Ten monetization tiles → one brand tint; delete the `bg`/`iconColor` keys (S1).
- **A1-2 → (a).** "Your revenue" is a quantity, not an outcome → brand tint (D2).
- **A1-3 → (a).** `bg-warning text-warning-foreground` CTA inside the warning band.
- **A1-4 → (a).** Status tint only where the metric is a status count (pending → `warning`,
  failed → `destructive`); every other tile brand (S1's exception).
- **A1-5 → (a).** `processing` → `bg-brand-tint text-brand-text border-primary/30`; four states stay
  four distinct fills and each carries its translated label (D4).
- **A1-6 → (a).** Net revenue → `text-foreground`; hierarchy already comes from the muted
  "Platform fees" figure beside it (D2).
- **A1-7 → (a).** Add the `pending` → `warning` tint branch, so payouts, invoices and transactions
  stop printing the same word in three colours.
- **A1-8 → (a).** Banner body copy stays in the status colour; AA is covered by
  `tests/unit/theme-kit-tokens.test.ts:160-168`.

### A2 — admin commerce
- **A2-1 → (c).** Mechanical status mapping on rows that genuinely report a lifecycle (products,
  subscriptions, courses, enrollments); brand tint on `plans`, where monthly/yearly are cadences,
  not states (S1). Token on the wrapper, icon colour class deleted, every tile in a row identical.
- **A2-2 → (a).** `text-success` on the Approve icon.
- **A2-3 → (a).** "Active" → `bg-success/10 text-success border-success/30` in all three files,
  edited identically in one pass. Letting `variant="default"` stand would paint it the school's
  brand and collide with every other primary chip on the page.

### A3 — admin payments
- **A3-1 → A.** `contacted` → `border-border bg-muted text-foreground`; `payment_received` →
  `bg-brand-tint text-brand-text`. Five states, five distinct fills (D4).
- **A3-2 → A.** Extract `lib/payments/payment-request-status.ts` exporting
  `PAYMENT_REQUEST_STATUS_STYLES` and import it from both callers (D6). Pure strings, no
  `'use client'`. This is the only new file surface 3 adds.
- **A3-3 → A.** The detail header uses the same tint map as the table.
- **A3-4 → A.** Complete & Enroll keeps `bg-success text-success-foreground hover:bg-success/90` at
  both call sites — it is the irreversible step that grants entitlements.
- **A3-5 → A.** `text-warning` on the cancel menu item; the red lives on the dialog's confirm.
- **A3-6 → A.** The four quoted-content panels go `text-foreground` on `bg-muted` (D9). The
  manual-transfer step list stays muted — it is scaffolding, not content to reconcile.
- **A3-7 → A.** `text-success` on the payment-confirmed glyph.

### A4 — admin billing, users, notifications
- **A4-1 → (a).** `text-warning` for "your plan cancels on …" — the mechanical translation.
- **A4-2 → (a).** `announcement` → `bg-primary text-primary-foreground`. Blue → brand is the rule
  and `announcement` is a type, not a status.
- **A4-3 → (a).** `high` becomes a warning **tint** so it stops out-shouting the `urgent`
  destructive tint; type and status stay solid, priority is a modifier (D4).
- **A4-4 → (a).** "Active" user → `success` tint in both files; same answer as A2-3.
- **A4-5 → (b).** Bare stat icons → uniform `text-muted-foreground` (S1). Not a contradiction of
  A1-1: those are tinted tiles, these are bare icons.

### A5 — admin landing-page builder
- **A5-1 → A.** Delete `CATEGORY_COLORS` and render `<Badge variant="outline">`. Five of the nine
  keys are dead (`lib/puck/templates/index.ts` only ships general / code-school / education /
  creative), so the hue teaches nothing and the badge already prints the name (D7).
- **A5-2 → i.** Leave the published/draft variant ternary alone. `published` and `is_active` are two
  different axes and two colour roles is the feature. Recorded so the "no" is deliberate.
- **A5-3 → keep `bg-border`.**

### O1 — onboarding wizard
- **O1-1 → Tokenise.** Drop Stripe's `#635BFF`; `components/admin/payment-settings-form.tsx:139`
  already renders the same Connect action as the default primary button.
- **O1-2 → Follow the theme.** Onboarding stops being forced-dark: the layout band becomes
  `bg-muted`, the five Cards lose their zinc shells, and the `dark` wrapper around the theme picker
  goes. **This is the loudest visual change in the PR** — a light-kit school now gets a light
  onboarding — and it must lead the PR description, not be buried. It also has to match O2-5.
- **O1-3 → `success` + muted** for the 80/20 revenue tiles.
- **O1-4 → uniform brand chips** on every step header; `success` is reserved for the Ready step's
  completion circle (S4). A success-coloured payment header reads as "already connected".
- **O1-5 → neutral ink** on the milestone panel: `text-foreground` / `text-muted-foreground` (D9).
- **O1-6 → `bg-brand-tint border-primary/20`** for the "why connect" panel; the neutral skip-Stripe
  note directly below it must stay neutral (#438 — an OFF rail never alarms).

### O2 — create-school
- **O2-1 → (a).** Keep three indicator states in create-school. Do **not** add a third state to the
  onboarding wizard to match: that is logic, not colour (D11). Record the divergence as a follow-up.
- **O2-2 → (a).** "Check your email" → `success` tint.
- **O2-3 → (a).** Recolour the slug addon in place. Rebuilding it on `InputGroup` is a structural
  refactor inside a colour sweep and it changes a control an E2E spec grabs by `data-testid`.
  Follow-up: the addon's corners never follow a kit's `--radius-input`.
- **O2-4 → (a) `border-primary/20`,** applied uniformly (S3).
- **O2-5 → (a). Sweep `/create-school`.** It is product register, it is in the baseline, and it is
  already a screen in the QA matrix. Same consequence as O1-2: the "after" shot is a light page in
  light mode, which must be stated up front or it reads as a regression.

---

## Part 3 — The acceptance target

Surface 3 starts at **1,082 palette + 94 raw across 89 files**. After the sweep exactly **six**
files may still appear in `tests/unit/palette-class-baseline.json`, each because Part 2 or D12 says so:

| file | allowed | why |
|---|---|---|
| `components/teacher/block-editor/editors/code-block.tsx` | `[8, 2]` | T1-2 — the Shiki dark panel is content; its learner twin is kept at `[9, 2]` |
| `components/teacher/lesson-editor/markdown-field.tsx` | `[0, 13]` | T5-4 — the MDX editor's fixed skin, kept as classes rather than as invented CSS vars |
| `components/teacher/certificate-preview.tsx` | `[14, 1]` | T6-1 — a facsimile of a printed certificate: fixed paper, user-picked ink |
| `components/teacher/certificate-template-form/issuer-section.tsx` | `[0, 1]` | D12 — opaque light plate behind the uploaded logo (dark artwork on transparency, printed on paper) |
| `components/teacher/certificate-template-form/signature-section.tsx` | `[0, 1]` | D12 — the same plate behind the scanned signature (black ink on transparency) |
| `app/[locale]/dashboard/admin/billing/checkout/[requestId]/solana-checkout-client.tsx` | `[0, 1]` | D12 — the QR quiet zone; surface 2 kept the identical plate in `components/public/checkout-form.tsx` `[0, 2]` |

**Every other file in the surface must reach `[0, 0]` and lose its baseline entry**, so the target
is 1,082 → 22 palette and 94 → 19 raw. If your group cannot reach that, report it as a deviation
rather than inventing a keep.

> **Amendment (2026-09-16, orchestrator).** The first version of this table listed three files and a
> 16-raw target, which contradicted D12 (it names the QR quiet zone as content) and the T6/A3 survey
> plans (which planned the logo, signature and QR plates as keeps). The three `[0, 1]` rows above
> resolve that contradiction in D12's favour. Each keep still needs its comment, and the comment still
> names no utility class.
