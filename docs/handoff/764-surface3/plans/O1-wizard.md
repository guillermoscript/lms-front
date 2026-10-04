# O1-wizard — onboarding wizard & checklist (issue #764, surface 3)

Measured with the exact guard regexes from `tests/unit/palette-class-guard.test.ts`
(counter script run from the scratchpad; no repo writes), 2026-09-16 on
`refactor/staff-theme-tokens-764` @ f52bcafc. Every measured count matches
`tests/unit/palette-class-baseline.json` — no drift.

| file | palette | raw | target |
|---|---|---|---|
| `components/onboarding/onboarding-wizard.tsx` | 87 | 21 | **0 / 0** (3 raw if judgment call O1-wizard-1 goes "keep") |
| `components/shared/onboarding-checklist.tsx` | 9 | 0 | **0 / 0** |
| `app/[locale]/onboarding/layout.tsx` | 3 | 0 | **0 / 0** |

**No keeps planned.** Nothing in this group is content colour — no code theme, no medal, no
user-picked colour, no scrim, no QR quiet zone. The one candidate is the Stripe brand purple
(`O1-wizard-1`); the recommendation is to tokenise it, which leaves the group with zero keeps
and all three entries **deleted** from `palette-class-baseline.json`
(`UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts`).

## Group-wide conventions (apply everywhere below, do not re-derive)

Taken from what #770/#771 actually shipped, so the staff screens match:

- brand-tinted chip / panel → `bg-brand-tint text-brand-text` + `border border-primary/20`
  (`/25` where the original edge was strong). Never `text-primary` on a tint.
- solid brand CTA → **delete the colour classes** and let the `Button` default variant apply
  (`bg-primary text-primary-foreground hover:bg-primary/80`, `components/ui/button.tsx:14`).
- `variant="ghost"` / `variant="outline"` Buttons → delete the colour classes; the variants
  already carry `hover:bg-muted hover:text-foreground` / `border-border hover:bg-input/50`.
  Keep at most `text-muted-foreground` where the button is deliberately quiet.
- success tint → `bg-success/10`, `border-success/30`, `text-success`; solid →
  `bg-success text-success-foreground`. (Repo convention: 50× `bg-success/10`,
  26× `border-success/30`, 108× `text-success`.)
- neutral inner panel inside a Card → `bg-muted/50 border border-border`; full-width page band
  → `bg-muted`; bordered raised panel → `bg-card`.
- **delete every `dark:` twin** — the tokens carry both modes.
- `Card`, `CardTitle`, `CardDescription`, `Input`, `Textarea`, `Label` are already fully
  token-styled (`bg-card` + `ring-1 ring-foreground/10`, `text-card-foreground`,
  `text-muted-foreground`, `bg-input/20 border-input`). Where the wizard only restates those
  colours, **delete the className**, do not translate it.

---

## 1. `components/onboarding/onboarding-wizard.tsx` — palette 87, raw 21 → 0 / 0

The whole file is one forced-dark shell: five zinc Cards with white ink, blue CTAs, a blue
info panel, one purple chip, one green chip, two emerald "good news" surfaces and the Stripe
purple button. There is no lookup map or helper function here — the leverage is that the same
six shapes repeat five times, so **do the shapes, not the lines**.

Highest-leverage edit: the five `<Card className="border-zinc-800 bg-zinc-900/50
backdrop-blur-sm">` shells (lines 169, 213, 271, 302, 405) plus the 19 `text-white` /
`text-zinc-*` ink classes that only exist because those shells are dark — rules 1, 4, 5, 6
below account for 60 of the 108 occurrences.

### Rules

1. **The five Card shells (10 palette).** Lines 169, 213, 271, 302, 405, all identical:
   `<Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">` → `<Card>`.
   `Card` already supplies `bg-card`, `text-card-foreground` and `ring-1 ring-foreground/10`;
   `border-zinc-800` is inert today (no `border` width class is present) and `backdrop-blur-sm`
   has nothing translucent left to blur once the fill is opaque `bg-card`. Delete all three.

2. **Progress dots, lines 149–162 (4 palette).**
   - reached: `bg-blue-500 scale-110` → `bg-primary scale-110`
   - upcoming dot and connector: `bg-zinc-700` (×2) → `bg-border`
   After rule 12 the dots sit on a `bg-muted` band; check the upcoming dot is still visible on
   the platform default and on Luz. If it washes out, use `bg-muted-foreground/30` for both
   upcoming shapes (same class for dot and connector — they are one state).

3. **Step-header icon chips (14 palette).** One rule, five sites — see judgment call
   O1-wizard-4 before applying to the payment step.
   - welcome hero, line 171: `bg-blue-500/10 … border border-blue-500/20` →
     `bg-brand-tint … border border-primary/20`; icon line 172 `text-blue-400` → `text-brand-text`
   - welcome benefit rows, line 189 `bg-blue-500/10` → `bg-brand-tint`; icon line 190
     `text-blue-400` → `text-brand-text`
   - school step, lines 216/217 — same swap as line 171/172
   - branding step, lines 274/275: `bg-purple-500/10` + `border-purple-500/20` +
     `text-purple-400` → the same `bg-brand-tint` / `border-primary/20` / `text-brand-text`
     (purple is a brand-like hue, not a status)
   - payment step, lines 305/306: `bg-green-500/10` + `border-green-500/20` + `text-green-400`
     → **recommended** the same brand chip (uniform step chrome), see O1-wizard-4
   - ready step, lines 407/408: `bg-emerald-500/10` + `border-emerald-500/20` +
     `text-emerald-400` → `bg-success/10` + `border-success/30` + `text-success`. This one stays
     a status: it is the completion state and it keeps its `CheckCircle2` icon and the
     "you're ready" title, so meaning never rests on colour.

4. **Heading / value ink `text-white` → delete (9 palette-free raw hits).** Lines 174, 220,
   278, 309, 410 are `CardTitle`s inside a Card — drop `text-white`, keep the size class
   (`text-3xl`, `text-xl`, `text-2xl`). Lines 320 and 341 are `<h4 className="font-semibold
   text-white …">` inside panels → drop `text-white`. Line 420 (`schoolName` value) and line
   424 (theme summary value) → `text-foreground` so they stay the emphasised half of the
   label/value pair.

5. **Muted ink (24 palette).** Mechanical:
   - `text-zinc-400` on a `CardDescription` (lines 177, 221, 279, 310, 411) → **delete**;
     `CardDescription` is already `text-muted-foreground`. Keep `text-lg mt-2` where present.
   - every other `text-zinc-400` (321, 345, 348, 378, 379) → `text-muted-foreground`
   - every `text-zinc-500` (235, 248, 349, 352, 419, 423) → `text-muted-foreground`
   - `text-zinc-300` on the two `Label`s (227, 239) → **delete** (Label inherits foreground)
   - `text-zinc-300` on real copy (192 benefit text, 331 benefit list item) → `text-foreground`;
     this text is the point of the panel, and `text-muted-foreground` on a tint measures poorly.

6. **Form controls (6 palette + 2 raw).** Lines 233 and 246:
   `className="bg-zinc-800/50 border-zinc-700 text-white"` on `Input` / `Textarea` →
   **delete the className entirely**. Both primitives already ship `bg-input/20 border-input
   placeholder:text-muted-foreground` with dark variants.

7. **Buttons (17 palette + 8 raw).**
   - primary CTAs, lines 200, 258, 433: `bg-blue-600 hover:bg-blue-500 text-white` → delete all
     three classes, keep layout ones (`w-full`, `h-12`, `text-base`). Default variant is primary.
   - ghost buttons, lines 252, 386, 447: `text-zinc-400 hover:text-white` →
     `text-muted-foreground` (ghost already sets `hover:text-foreground`).
   - ghost back-link, line 457: `text-zinc-500 hover:text-zinc-300` → `text-muted-foreground`.
   - outline "skip for now", line 393: `border-zinc-700 text-zinc-400 hover:bg-zinc-800
     hover:text-white` → delete all four; `variant="outline"` covers border, hover fill and
     hover ink.

8. **"Why connect" panel, lines 316–336 (5 palette).** See judgment call O1-wizard-6.
   Recommended: `rounded-xl border border-blue-800/50 bg-blue-900/20 p-5` →
   `rounded-xl border border-primary/20 bg-brand-tint p-5`; the `DollarSign` icon line 318
   `text-blue-400` → `text-brand-text`; the `•` bullets line 332 `text-blue-400` →
   `text-brand-text`. Ink inside handled by rules 4 and 5.

9. **Revenue-split box, lines 340–355 (8 palette).** See judgment call O1-wizard-3.
   Recommended:
   - outer box line 340 `border border-zinc-800 … bg-zinc-800/20` →
     `border border-border … bg-muted/30`
   - school's 80% tile line 343 `bg-emerald-500/10 border border-emerald-500/20` →
     `bg-success/10 border border-success/30`; the figure line 344 `text-emerald-400` →
     `text-success`
   - platform's 20% tile line 347 `bg-zinc-700/30 border border-zinc-700` →
     `bg-muted border border-border`; the figure line 348 `text-zinc-400` → `text-foreground`
     (it must stay legible as a number; the *tile* is what reads as "not yours")
   - the two tiles keep their labels ("Your revenue" / "Platform fee"), so the pair still reads
     as two states without colour.

10. **Neutral panels and dividers (9 palette).**
    - welcome benefit rows, line 188: `bg-zinc-800/30 border border-zinc-800` →
      `bg-muted/50 border border-border`
    - skip-Stripe note, line 377: `bg-zinc-800/40 border border-zinc-700` →
      `bg-muted/50 border border-border`; its `AlertCircle` line 378 `text-zinc-400` →
      `text-muted-foreground` (rule 5). It is deliberately **not** a warning (#438 comment on
      line 376 says so) — do not promote it to `warning`.
    - footer divider, line 385: `border-t border-zinc-800` → `border-t border-border`
    - ready summary box, line 417: `border border-zinc-800 … bg-zinc-800/20` →
      `border border-border … bg-muted/30`

11. **Stripe Connect button, line 364 (3 raw: 2 arbitrary hex + `text-white`).** See judgment
    call O1-wizard-1. Recommended: `className="w-full bg-[#635BFF] hover:bg-[#5851EA]
    text-white h-12"` → `className="w-full h-12"`. Precedent in this repo:
    `components/admin/payment-settings-form.tsx:139` already renders the same
    `/api/stripe/connect` action as `bg-primary text-primary-foreground`. The `CreditCard` icon
    and the "Connect Stripe" label carry the vendor identity.

12. **Delete the forced-dark scope around the picker, lines 284–295 (0 counted, but this is the
    correctness half of the sweep).** The comment on lines 284–286 says in as many words that
    the wrapper exists *because* the shell is hardcoded dark (#764). Once rule 1 lands, that
    wrapper renders the token-styled `ThemeKitPicker` in the dark palette inside a light card.
    Remove **both** the `<div className="dark text-foreground">` wrapper and its three-line
    comment, leaving `<ThemeKitPicker … />` as the direct child of `CardContent`.
    Safe: `useKitPreviewMode` (`components/theme-kit/theme-kit-preview.tsx:27`) reads
    next-themes' `resolvedTheme`, not the DOM class, so the phone/preview panes are unaffected;
    only the picker's own chrome changes, which is what we want.

### Inline styles / hex constants

- **None that style anything.** The only hex in the file is data: `renderedTheme.brand` and
  `KIT_THEMES[...].swatches.find((s) => s.hex === renderedTheme.brand)?.name` (lines 80–84)
  compare and *print* the school's chosen swatch as text. Leave exactly as is.
- No `style={{ color }}` / `backgroundColor`, no chart props, no class-returning helper or
  lookup map in this file.

### Verification notes for the sweeping agent

- The three step-progress dots, the Ready-step check and the 80/20 tiles are the only places
  where colour carries state; each keeps an icon or a text label after the sweep.
- `data-testid="onboarding-ready-theme"` (line 424) is asserted by the theme-kit E2E specs —
  keep the attribute when editing that span.

---

## 2. `components/shared/onboarding-checklist.tsx` — palette 9, raw 0 → 0 / 0

Already 95% tokenised (`bg-primary`, `text-muted-foreground`, `border-border/60`). Everything
left is the one emerald milestone panel, lines 205–245. This component renders on the **admin,
teacher and student** dashboards, so it is the last palette block on an otherwise-swept learner
page too.

### Rules

1. **Milestone panel shell, line 209 (2 palette).**
   `className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"` →
   `className="mb-4 rounded-xl border border-success/30 bg-success/10 p-4"`.
   (`bg-emerald-500/[0.06]` is counted as a palette class by the guard; `bg-success/10` is the
   repo's standard tint and is closer in weight to what the arbitrary opacity was after.)

2. **Confetti badge, line 213 (3 palette).**
   `rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300` →
   `rounded-full bg-success/15 text-success`. Delete the `dark:` twin. The `IconConfetti`
   stays — it is what carries "you hit the milestone" once the hue is the platform's.

3. **Milestone title, line 217 (2 palette).** `font-semibold text-emerald-950
   dark:text-emerald-50` → `font-semibold text-foreground`. See judgment call O1-wizard-5.

4. **Milestone description, line 220 (2 palette).** `mt-1 text-xs text-emerald-900/70
   dark:text-emerald-100/70` → `mt-1 text-xs text-muted-foreground`. The panel is
   `bg-success/10` over `bg-card`, not `bg-muted`, so muted ink keeps its contrast here.

Nothing else in the file changes: the progress bar (`bg-muted` track, `bg-primary` fill), the
next-step card (`border-primary/25 bg-background`), the completed/upcoming rows
(`bg-primary text-primary-foreground`, `border-muted-foreground/30`, `hover:bg-primary/5`) are
all already tokens.

### Inline styles / hex constants

- Line 196 `style={{ width: `${progress}%` }}` is geometry, not colour. Leave it.
- No hex, no helper returning class strings, no charts.

---

## 3. `app/[locale]/onboarding/layout.tsx` — palette 3, raw 0 → 0 / 0

Four lines of shell. This is the band the wizard (and the onboarding error boundary) sit on.

### Rules

1. **The page band, line 13 (3 palette).**
   `className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex
   items-center justify-center p-4"` →
   `className="min-h-screen bg-muted flex items-center justify-center p-4"`.
   A decorative multi-stop gradient collapses to a single token fill; `bg-muted` (not
   `bg-background`) so the wizard's `bg-card` still reads as a raised panel on the no-kit
   platform default, where `--card` equals `--background`. See judgment call O1-wizard-2 — this
   line and wizard rules 1/12 are one decision and must land together.

### Inline styles / hex constants

- None. The file has no other colour of any kind.

### Note

`app/[locale]/onboarding/error.tsx` → `components/shared/segment-error.tsx` already renders a
fully token-styled panel *inside* this band, i.e. a light card on a zinc-950 gradient today.
Flipping the band to `bg-muted` fixes that mismatch for free.

---

## Judgment calls (orchestrator decides)

See the structured output for the canonical list; summarised here for the sweeping agent:

- **O1-wizard-1** — Stripe brand purple (`wizard:364`). Recommend tokenising to the Button
  default; precedent `components/admin/payment-settings-form.tsx:139`. If "keep", the button
  needs its own keep comment worded with no literal utility class, e.g.
  `/* Stripe's own brand purple and its light ink: vendor identity on the connect action, not school chrome */`
  and the file's baseline entry becomes `[0, 3]`.
- **O1-wizard-2** — does onboarding stop being forced-dark? Recommend yes (band `bg-muted`,
  cards `bg-card`, picker wrapper deleted). If the answer is "keep it dark", do it with a
  `dark` class on the layout wrapper plus `bg-background` (token-legal, still 0/0) — but then
  `components/tenant/create-school-flow.tsx` (baseline `[69, 11]`, another group) and
  `app/[locale]/create-school/page.tsx` (`bg-[#0A0A0A]`) must take the same decision, since
  create-school → onboarding is one continuous flow.
- **O1-wizard-3** — 80/20 revenue tiles: `success` vs `brand-tint`. Recommend `success` + `muted`.
- **O1-wizard-4** — payment step's green header chip: uniform brand chip vs `success`.
  Recommend brand (uniform chrome); `success` stays reserved for the Ready step.
- **O1-wizard-5** — milestone ink: `text-foreground` + `text-muted-foreground` vs coloured
  `text-success` ink. Recommend foreground/muted; the tint and the confetti icon carry it.
- **O1-wizard-6** — "why connect" panel: brand tint vs neutral `bg-muted/50`. Recommend brand
  tint (it is the persuasive panel of the step, and blue here is emphasis, not information
  status).

## Cross-file findings (outside this group — do not edit)

1. `components/tenant/create-school-flow.tsx` — baseline `[69, 11]`, the same dark-zinc wizard
   idiom (its own step dots, cards and CTAs). It is the screen immediately before this one;
   whatever O1-wizard-2 decides must apply there too.
2. `app/[locale]/create-school/page.tsx` — baseline `[0, 1]`, the shell around that flow is
   `bg-[#0A0A0A]`, the light-mode twin of this layout's gradient.
3. `components/theme-kit/theme-kit-picker.tsx` — **not** in the baseline, fully token-styled.
   No edit needed; it is only named here because the wizard's `dark` wrapper (rule 12) exists
   to compensate for the wizard, not for the picker.
4. `components/shared/segment-error.tsx` — clean (`[0, 0]`); it renders inside the onboarding
   band and already assumes theme tokens.
5. `components/ui/{card,button,input,label}.tsx` — all clean and token-based; every "delete the
   className" rule above relies on that and needs no change in `components/ui/*`.
