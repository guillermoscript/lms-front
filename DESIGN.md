---
name: LMS Platform
description: Multi-tenant LMS where the room stays quiet so the material can be loud.
colors:
  slate-teal: "oklch(0.52 0.105 223.128)"
  slate-teal-deep: "oklch(0.45 0.085 224.283)"
  slate-teal-mid: "oklch(0.609 0.126 221.723)"
  slate-teal-bright: "oklch(0.715 0.143 215.221)"
  slate-teal-pale: "oklch(0.865 0.127 207.078)"
  ink: "oklch(0.141 0.005 285.823)"
  ink-muted: "oklch(0.552 0.016 285.938)"
  paper: "oklch(1 0 0)"
  paper-raised: "oklch(0.985 0 0)"
  surface-quiet: "oklch(0.967 0.001 286.375)"
  surface-slate: "oklch(0.21 0.006 285.885)"
  surface-slate-quiet: "oklch(0.274 0.006 286.033)"
  hairline: "oklch(0.92 0.004 286.32)"
  ring-neutral: "oklch(0.705 0.015 286.067)"
  alert: "oklch(0.577 0.245 27.325)"
  alert-dark: "oklch(0.704 0.191 22.216)"
  on-teal: "oklch(0.984 0.019 200.873)"
typography:
  display:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body-learner:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  body-staff:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "Noto Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
spacing:
  hairline-gap: "4px"
  tight: "8px"
  snug: "12px"
  base: "16px"
  loose: "24px"
  section: "40px"
  chapter: "64px"
components:
  button-primary:
    backgroundColor: "{colors.slate-teal}"
    textColor: "{colors.on-teal}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "oklch(0.52 0.105 223.128 / 0.8)"
    textColor: "{colors.on-teal}"
  button-primary-learner:
    backgroundColor: "{colors.slate-teal}"
    textColor: "{colors.on-teal}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-destructive:
    backgroundColor: "oklch(0.577 0.245 27.325 / 0.1)"
    textColor: "{colors.alert}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  input-default:
    backgroundColor: "oklch(0.92 0.004 286.32 / 0.2)"
    textColor: "{colors.ink}"
    typography: "{typography.body-staff}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
    height: "28px"
  card-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-staff}"
    rounded: "{rounded.lg}"
    padding: "16px 0"
  card-sm:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 0"
---

# Design System: LMS Platform

## 1. Overview

**Creative North Star: "The Quiet Classroom"**

A good classroom is not decorated. It is arranged. The walls recede, the light is even, the seats face one direction, and everything you notice is either the material or your own place in the sequence. That is the whole system: a quiet room built so the content can be the loudest thing in it. Nothing on screen is present for atmosphere. If an element is not carrying information, state, or a next action, it is removed rather than styled down.

The room has two arrangements. On **learner surfaces** (lesson, exercise, checkpoint, exam, browse) it is a reading room: generous, single-focus, one primary action visible, body type sized for a session that lasts an hour on a phone. On **staff surfaces** (analytics, grading, payouts, enrollment, platform panel) it is a desk: dense, comparative, scan-first, small type in exchange for seeing more at once. Same tokens, same components, two spacing registers. The component library defaults to the desk, so the reading room is always an explicit choice.

The room is also rented. Every school overrides the primary color, the corner radius, and the body typeface through CSS custom properties, so nothing structural may depend on any of the three. What stays constant is the arrangement: the hierarchy, the density rules, the hairlines, the placement of the next action. Two schools must be recognizably the same product and recognizably different brands. This system explicitly rejects the generic shadcn template look (default zinc, identical icon-heading-text card grids, hero-metric rows), gamified candy (mascots, confetti, elastic motion, saturated reward badges), the cluttered enterprise LMS (Moodle, Blackboard, Canvas), and SaaS marketing cliché (gradient text, glassmorphic heroes, purple mesh).

**Key Characteristics:**
- Flat surfaces, hairline separation, shadows reserved for floating layers only
- Muted teal accent at low chroma, deployed sparingly, never as decoration
- Neutrals held at a constant violet-grey hue that is deliberately independent of the tenant brand
- Two named density registers, learner and staff, never averaged
- Progress communicated by position and sequence, not by reward graphics
- Bilingual layouts (en/es) with Spanish as the sizing case, not the afterthought

## 2. Colors: The Slate Teal Palette

A cool, deliberately desaturated palette. The brand teal sits at chroma 0.105, roughly half what a default framework accent would use, because it has to survive being the only saturated thing on a page full of text.

### Primary
- **Slate Teal** (`oklch(0.52 0.105 223.128)`): the brand accent. Primary buttons, active navigation, links inside prose, focus emphasis, the single filled element in an otherwise flat view. Tenant-overridable. Light theme value.
- **Slate Teal Deep** (`oklch(0.45 0.085 224.283)`): the dark-theme primary and the darkest step of the data ramp. Lower chroma than its light counterpart so it does not glare against a near-black surface.
- **On Teal** (`oklch(0.984 0.019 200.873)`): the only ink permitted on a filled Slate Teal surface. Very slightly teal-tinted white, never pure white.

### Secondary
- **Slate Teal Mid** (`oklch(0.609 0.126 221.723)`) and **Slate Teal Bright** (`oklch(0.715 0.143 215.221)`): the sidebar active state and the mid steps of the chart ramp. Chroma rises as lightness rises, which is what keeps the ramp readable at both ends.
- **Slate Teal Pale** (`oklch(0.865 0.127 207.078)`): the lightest chart step and the tint used behind selected or highlighted rows.

Together these five form the data-visualization ramp (`--chart-1` through `--chart-5`). It is monochromatic by construction: a single hue family stepped by lightness. That is a deliberate constraint. A categorical series needs a second encoding (label, shape, order) rather than a second hue, because a second hue would collide with tenant theming.

### Neutral
- **Ink** (`oklch(0.141 0.005 285.823)`): primary text on light, and the page surface on dark.
- **Ink Muted** (`oklch(0.552 0.016 285.938)`): secondary text, captions, placeholder text, metadata. Never used for anything a user must act on.
- **Paper** (`oklch(1 0 0)`) and **Paper Raised** (`oklch(0.985 0 0)`): the light page surface and the sidebar. The only place a pure value is permitted, and only as a background.
- **Surface Quiet** (`oklch(0.967 0.001 286.375)`): muted and secondary fills on light. Inline code, table headers, secondary buttons, disabled fills.
- **Surface Slate** (`oklch(0.21 0.006 285.885)`) and **Surface Slate Quiet** (`oklch(0.274 0.006 286.033)`): the dark-theme card and muted fills. Dark mode layers tonally rather than with shadow.
- **Hairline** (`oklch(0.92 0.004 286.32)`): every border, divider, and input stroke on light. On dark this becomes `oklch(1 0 0 / 10%)`, an alpha value rather than a solid, so it composites correctly over any tonal layer.
- **Ring Neutral** (`oklch(0.705 0.015 286.067)`): the default focus ring where the brand color would be too loud or is not yet resolved.

### Tertiary
- **Alert** (`oklch(0.577 0.245 27.325)`) light, **Alert Dark** (`oklch(0.704 0.191 22.216)`) dark: destructive and error only. This is the one high-chroma color in the system and its chroma is the signal. It appears as a 10 to 20 percent tint behind red text, not as a solid red fill. A solid red button is prohibited.

### Named Rules

**The Constant Neutral Rule.** The neutrals sit at hue 285 to 286, a cool violet-grey, while the brand sits at hue 223. They are not tinted toward the brand, and this is deliberate rather than an oversight. The brand hue is tenant-variable; a neutral tinted toward it would shift under every school, and the whole product would change temperature per tenant. The neutral axis is the constant that makes two tenants read as one product. Never re-tint neutrals to match a tenant primary.

**The Single Filled Element Rule.** On any learner view, exactly one element carries a filled Slate Teal background: the next action. Everything else is text, hairline, or tonal fill. If a screen has two filled teal elements, one of them is not the next action and should be an outline or ghost variant.

**The Tenant-Proof Rule.** Every contrast, emphasis, and state decision must hold when the primary is replaced by an arbitrary tenant color. Color is never the sole carrier of meaning: status, validation, correctness, and severity always pair color with text, icon, or position. Derived inks are computed from the resolved color, never hardcoded. This has already shipped as a bug (issue #569); it is not hypothetical.

**The No Pure Ink Rule.** `#000` and `#fff` are prohibited as text colors. Text on light is Ink at lightness 0.141; text on dark is `oklch(0.985 0 0)`. Pure white survives only as a page background.

## 3. Typography

**Body and UI Font:** Noto Sans (with `ui-sans-serif, system-ui, sans-serif`), bound to `--font-sans` and applied to `html`. Chosen for its Latin coverage and its even color at small sizes in both English and Spanish.
**Mono Font:** Geist Mono, bound to `--font-mono`. Code blocks, inline code, IDs, and any fixed-width tabular figure.
**Display:** the same Noto Sans at heavier weight. There is no separate display face.

**Character:** a single humanist sans doing all the work, differentiated by weight and size rather than by family. This is the typographic expression of "content over chrome": the interface has no typographic personality of its own, so the material supplies it. Geist Sans was previously loaded as `--font-geist-sans` with no consumer and has been removed; do not reintroduce a second sans. Display is Noto Sans at weight 700, and it must resolve through `--font-sans` so that a tenant overriding the body face gets a coherent pairing rather than their font against a hardcoded one.

### Hierarchy

- **Display** (700, 2rem / 32px, 1.2): page titles and prose `h1`. One per view.
- **Headline** (600, 1.5rem / 24px, 1.3): section headings and prose `h2`.
- **Title** (500, 0.875rem / 14px, 1.4): card titles, table headers, form section labels. The workhorse heading of the staff register.
- **Body, learner** (400, 1rem / 16px, 1.75): lesson prose, exercise statements, exam questions, anything read for more than a few seconds. Capped at 65ch, matching the existing `.prose` container.
- **Body, staff** (400, 0.75rem / 12px, 1.625): the base-mira default. Dense tables, dashboards, filter bars, admin forms.
- **Label** (500, 0.625rem / 10px, `0.01em`): badges, chips, `xs` buttons, metadata stamps. Sentence case, never uppercase-tracked-out.

### Named Rules

**The Two Registers Rule.** base-mira ships tuned for dense tooling: `h-7` buttons, `text-xs` bodies, `text-xs/relaxed` cards. Those defaults are the **staff register** and they are correct there. Learner surfaces must explicitly opt into the **learner register**: `size="lg"` or larger controls, `text-sm` minimum and `text-base` for read prose, `gap`/`padding` one step up from the component default. Never ship a lesson, exercise, checkpoint, or exam surface on the raw component defaults. A learner reading 12px prose for an hour on a mid-range Android is the failure this rule exists to prevent.

**The Spanish Sizing Rule.** Spanish strings run 20 to 30 percent longer than English. Every label, button, table header, and nav item is sized against its Spanish string, not its English one. If it only fits in English, it does not fit. Truncation is a bug, not a layout strategy.

**The Measure Rule.** Read prose is capped at 65ch and never exceeds 75ch. This is already enforced by `.prose { max-width: 65ch }` in `app/globals.css`; do not override it to fill a wide container. Empty space beside a column of text is correct.

**The One Sans Rule.** There is exactly one sans in the system, bound to `--font-sans`, and every text role resolves through it. Display is that face at weight 700, not a second family. Adding a display or heading font is prohibited: it doubles the font payload for the mid-range-Android baseline, and because tenants override `--font-sans`, a hardcoded second face would pair a school's chosen font against one they never picked. Geist Mono is the only other family, and it earns its place by doing work no sans can do.

**The Tenant Typeface Rule.** Tenants may override `--font-sans` entirely (`components/tenant/tenant-css-vars.tsx`). No layout may depend on Noto Sans metrics. Fixed heights sized to a specific font's cap height, single-line assumptions, and `ch`-based widths outside the prose container are all prohibited.

## 4. Elevation

This system is flat. Surfaces do not float, and depth is communicated by hairlines and tonal layering rather than by shadow. `Card` is defined as `ring-1 ring-foreground/10`: a single hairline ring at 10 percent of the text color, which means it darkens or lightens correctly with the theme instead of being a fixed grey. On dark, layering is entirely tonal: page at `oklch(0.141 ...)`, card at `oklch(0.21 ...)`, muted fill at `oklch(0.274 ...)`. Three steps, no shadow between them.

Shadows exist in exactly one situation: an element that is genuinely floating above the page and detached from the layout. Popovers, dropdown menus, dialogs, sheets, tooltips, and toasts. Their shadow says "this is temporary and will be dismissed", which is information. A shadow on a card says nothing.

### Shadow Vocabulary

- **Overlay, low** (`shadow-sm`): tooltips and small popovers. Barely present; the border does most of the separation.
- **Overlay, standard** (`shadow-md`): dropdown menus, comboboxes, select popups, hover cards. The default for anything anchored to a trigger.
- **Overlay, detached** (`shadow-lg`): dialogs and sheets, which are fully detached from their trigger and sit over a scrim.

### Named Rules

**The Nothing Floats Rule.** Cards, panels, table rows, list items, sidebars, headers, and stat blocks are flat. If it participates in the page layout, it gets a hairline or a tonal fill, never a shadow. If you reach for `shadow-md` on a card to make it "pop", the hierarchy is wrong somewhere else.

**The Hairline Composites Rule.** Borders use `ring-foreground/10` or `oklch(1 0 0 / 10%)` style alpha values rather than solid greys, so a divider stays correct over paper, over a muted fill, and over any tonal dark layer. A solid `oklch(0.92 ...)` border hardcoded onto a dark surface is a bug.

**The Two-Layer Limit Rule.** No more than two nested elevation contexts. A card inside a card is prohibited outright. A popover inside a dialog is the maximum stack.

## 5. Components

Built on Shadcn UI in the base-mira variant over `@base-ui/react` primitives. The character is **precise and unassuming**: tight geometry, hairline definition, low contrast at rest, decisive on interaction. Nothing announces itself until it is being used.

Note for implementers: base-ui's `Button` has no `asChild` prop. Wrap `<Link>` around `<Button>`, and use the `render={...}` prop on `DropdownMenuTrigger` and `BreadcrumbLink`.

### Buttons

- **Shape:** softly rounded (8px, `rounded-md`); the `xs` and `icon-xs` sizes tighten to 6px (`rounded-sm`). All radii derive from `--radius: 0.625rem`, which tenants may override.
- **Sizes:** the staff register runs `xs` (20px) through `lg` (32px), with `default` at 28px and 12px text. The learner register uses `lg` at minimum, and learner primary actions should be raised to 40px with 14px text. Touch targets on learner surfaces never go below 40px.
- **Primary:** filled Slate Teal with On Teal ink, at the tightest padding in the system (`px-2` at default size). It is small and saturated rather than large and soft.
- **Hover:** primary drops to 80 percent opacity (`hover:bg-primary/80`). Outline and ghost fill with a muted tint. All transitions run on color and opacity only.
- **Focus:** `focus-visible:border-ring` plus a 2px ring at 30 percent (`ring-ring/30`). The ring must stay visible against tenant-overridden backgrounds; verify it, do not assume it.
- **Outline / Secondary / Ghost:** the default for anything that is not the single next action. Outline carries a hairline border and a muted hover; ghost carries nothing at rest.
- **Destructive:** a 10 percent Alert tint with Alert-colored text, not a solid red fill. Escalates to 20 percent on hover. A solid red button is prohibited.
- **Link:** Slate Teal text with `underline-offset-4`, underlined on hover.

### Cards / Containers

- **Corner Style:** 10px (`rounded-lg`).
- **Background:** Paper on light, Surface Slate on dark.
- **Shadow Strategy:** none. `ring-1 ring-foreground/10` only. See Elevation.
- **Internal Padding:** 16px (`px-4 py-4`) at default, 12px at `size="sm"`. Learner surfaces step up to 24px.
- **Content:** first-child and last-child images bleed to the card edge and inherit the corner radius. Use this rather than an inner image wrapper.
- Cards are not the default container. Most content does not need one. Nested cards are prohibited.

### Inputs / Fields

- **Style:** 28px tall, hairline border, a 20 percent tint of the input color as fill (`bg-input/20`, `dark:bg-input/30`), 8px horizontal padding, 8px radius. Learner-facing forms step to 40px.
- **Focus:** border shifts to ring color plus a 2px ring at 30 percent. No glow, no scale, no color flood.
- **Error:** `aria-invalid` drives the styling, not a class. Destructive border plus a 20 percent destructive ring, paired with a text message. Color alone never marks a field invalid.
- **Disabled:** 50 percent opacity, `cursor-not-allowed`, pointer events off.

### Navigation

- **Sidebar** carries its own token set (`--sidebar`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`) so it can sit a half-step off the page surface without a shadow. Active items use Slate Teal Mid on light, Slate Teal Bright on dark.
- **Active state** is carried by fill and weight together, never by color alone.
- **Mobile:** the sidebar becomes a sheet. Learner surfaces keep the primary action reachable in the thumb zone rather than in a collapsed nav.

### Prose (signature component)

The `.prose` container in `app/globals.css` is the most-read surface in the product and the one place with a hand-authored type scale: 65ch measure, 1.75 body line-height, `h1` 2rem / `h2` 1.5rem / `h3` 1.25rem, code and `pre` on Surface Quiet with a hairline and the base radius, links in Slate Teal with a 4px underline offset, blockquotes with a 4px left border in Hairline. That blockquote border is the single sanctioned exception to the side-stripe prohibition, because it is a typographic convention with centuries of precedent and it is neutral-colored, not an accent stripe. It does not license colored left-borders anywhere else.

### Gamification surfaces (signature component)

XP, levels, streaks, achievements, leagues, and the coin store render as a **ledger**, not a reward screen. Numbers are typographic, set in Title or Body weight, not oversized. Badges are Label-sized chips on tonal fills, never saturated primary-colored medals. Level-up and streak events get a single state transition and then rest. No confetti, no mascots, no elastic motion, no exclamation marks. The test: it should read as a bank statement a professional would not mind having on screen in public.

## 6. Do's and Don'ts

### Do:

- **Do** use OKLCH for every color. The entire token layer is OKLCH and mixing in hex or HSL breaks the tenant-theming pipeline.
- **Do** pick a register before you start: staff (base-mira defaults, `text-xs`, `h-7`) or learner (`text-sm` minimum, `text-base` prose, 40px controls, 24px padding). Write it down in the component before styling.
- **Do** keep exactly one filled Slate Teal element per learner view: the next action.
- **Do** pair every color signal with a text, icon, or positional signal. Status, validation, correctness, severity, all of them.
- **Do** separate surfaces with `ring-1 ring-foreground/10` or a tonal fill step.
- **Do** size every label against its Spanish string and check the layout at `/es` before calling it done.
- **Do** design the empty, missing, loading, and error states in the same pass as the happy path. Missing data renders as missing; ungraded renders as ungraded, never as zero (issues #567, #568).
- **Do** respect `prefers-reduced-motion` by collapsing transitions to instant state changes, not to slower ones.
- **Do** ease out with exponential curves (ease-out-quart / quint / expo) on the transitions that remain.
- **Do** verify focus rings and contrast against a non-default tenant primary, not just the shipped Slate Teal.

### Don't:

- **Don't** ship the **generic shadcn template**: default zinc neutrals, identical icon-heading-text card grids repeated down a page, everything wrapped in a bordered box, or a hero-metric row of big numbers with small labels. This is the single most likely failure mode in this codebase.
- **Don't** ship **gamified candy**: cartoon mascots, ambient confetti, bouncy or elastic easing, saturated primary-colored reward badges, or exclamation marks in system copy. Adults use this, and the creator's professional reputation is attached to it.
- **Don't** build a **cluttered enterprise LMS**: dense nav trees, competing toolbars, tables without hierarchy, five routes to the same page. No Moodle, no Blackboard, no Canvas.
- **Don't** use **SaaS marketing cliché**: gradient text (`background-clip: text` is banned outright), glassmorphic hero cards, purple-and-blue mesh gradients. This applies to `(public)/*` and to everything the AI landing-page builder is permitted to emit.
- **Don't** put a shadow on anything that participates in the page layout. Cards, rows, panels, headers, sidebars: flat.
- **Don't** nest a card inside a card. Ever.
- **Don't** use a `border-left` or `border-right` greater than 1px as a colored accent stripe on a card, list item, callout, or alert. The neutral `.prose blockquote` border is the only exception in the system.
- **Don't** hardcode a derived ink, tint, or contrast value against Slate Teal. Compute it from the resolved primary; tenants override it.
- **Don't** re-tint the neutrals toward a tenant's brand hue. The violet-grey neutral axis is what keeps two tenants recognizable as one product.
- **Don't** use a solid red fill for destructive actions. Tint at 10 percent with Alert-colored text.
- **Don't** render `text-xs` body copy on a learner surface. That is the staff register leaking into a reading session.
- **Don't** let color be the only difference between two states, two series, or two severities.
- **Don't** reach for a modal first. Exhaust inline and progressive-disclosure alternatives; the product already has sheets and popovers for detail.
- **Don't** animate layout properties. Transform and opacity only.
- **Don't** add a second hue to a chart. The ramp is monochromatic by design because a second hue collides with tenant theming; encode the second dimension with label, shape, or order.
