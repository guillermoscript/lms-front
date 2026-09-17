# O2-create-school — theme-token sweep plan (issue #764 surface 3, epic #766)

Survey only. No code was edited. Counts below were measured with the guard's own
regexes (`tests/unit/palette-class-guard.test.ts`) run over the working tree, and they
match `tests/unit/palette-class-baseline.json` exactly.

| file | palette | raw | after |
|--|--|--|--|
| `components/tenant/create-school-flow.tsx` | 69 | 11 | **0 / 0** |
| `app/[locale]/create-school/page.tsx` | 0 | 1 | **0 / 0** |

Both files reach zero. **Both entries are deleted from `palette-class-baseline.json`**
(the guard omits a file with neither count entirely), not lowered to `[0, 0]`.

There are **no keeps that the guard can see** in this group. The only literal colours that
stay are the four `fill="#…"` attributes on Google's `<svg>` mark, which are JSX attributes,
not utility classes, and are counted by neither detector.

---

## Context the executing agent needs before touching either file

**This route is tenant-less.** `/create-school` is where a school does not exist yet, so
there is no theme kit to read. After the sweep it resolves the *platform default* tokens
(teal-cyan `--primary`, `--background` white / near-black) through `next-themes`, whose
`defaultTheme` comes from `defaultThemeFor(tenantInfo?.theme)` in `app/[locale]/layout.tsx`
with `tenantInfo === null`. So the visible change is: **the page stops being forced
near-black and starts following light/dark.** That is the same call #771 made for
`components/public/school-landing-page.tsx` (`bg-[#0A0A0A]` → `bg-background`). Expect the
QA screenshots to go light in light mode — that is the fix, not a regression. See judgment
call **O2-create-school-5** before assuming it.

**Almost every edit here is a deletion, not a substitution.** `Card`, `Button`, `Input`,
`Label`, `InputGroup` and `InputGroupInput` all already carry token defaults
(`bg-card` + `ring-1 ring-foreground/10`, `bg-primary text-primary-foreground`,
`border-input bg-input/20`, and so on). The palette classes in this file exist only to
repaint those primitives dark. Verified by reading `components/ui/card.tsx`,
`button.tsx`, `input.tsx`, `label.tsx`, `input-group.tsx` — all five are clean of palette
and raw colours and are absent from the baseline, so there is no cross-file blocker.

**`body` already paints `bg-background text-foreground`** (`app/globals.css:196`), so the
page shell only needs the class for the `min-h-screen` centering box, not to establish ink.

**Contrast is guaranteed by construction** for every token this plan reaches for:
`tests/unit/theme-kit-tokens.test.ts:149` asserts `success` / `warning` / `destructive` as
text on `background`, `card`, `muted` and their `/15` tint across every kit and the platform
palette, and `:174` asserts `brand-text` on `background`, `card`, `muted` and `brand-tint`.

---

# `components/tenant/create-school-flow.tsx`

**palette 69 · raw 11 (all `text-white` / `hover:text-white`) → 0 / 0**

The whole file is one forced-dark shell: a near-black page, three `bg-zinc-900` cards with
white ink, `bg-blue-600` CTAs, `bg-zinc-800` inputs, and two emerald "good news" surfaces.
There is no helper function, lookup map or `cn()` assembly anywhere in the file — every
colour is a literal in a JSX `className`, and the same six shapes repeat across the three
steps.

**Highest-leverage edit:** rules 1–5 below (the three `<Card>` shells at lines 287 / 416 / 454,
the five `<Label>` overrides, the five `<Input>` overrides, the three primary `<Button>`
overrides, and the Google `<Button>` override) are **26 palette + 6 raw classes removed by
deleting `className` text, substituting nothing**. Do those first; what is left is 15 real
mappings.

### Rules

1. **The three `<Card>` shells (12 palette).** Lines 287, 416, 454, all identical:
   `<Card className="bg-zinc-900 border-zinc-800">` → `<Card>`.
   `Card` supplies `bg-card text-card-foreground ring-1 ring-foreground/10`. `border-zinc-800`
   is inert today — there is no `border` width class on the element — so it is pure noise.
   Leave the child `<CardContent className="pt-6">` untouched; it carries no colour.
   *(Identical to O1-wizard rule 1 — the two flows share this shell.)*

2. **The five `<Label>` overrides (5 palette).** Lines 327, 343, 358, 467, 482:
   `className="text-zinc-300"` → delete the `className` prop entirely. `Label` has no colour
   of its own, so it inherits `text-card-foreground` from the `Card`, which is the full-contrast
   ink a form label wants.

3. **The five `<Input>` / `<InputGroupInput>` overrides (10 palette, 4 raw).**
   - Lines 335, 351, 474: `className="bg-zinc-800 border-zinc-700 text-white"` → delete the
     `className` prop entirely.
   - Line 366 (`InputGroupInput`): same three classes → delete the prop. Note this one is
     doubly wrong today: `InputGroupInput` ships `border-0 bg-transparent`, so the palette
     classes are fighting the primitive that draws the group's border.
   - Line 490: `className="bg-zinc-800 border-zinc-700 text-white rounded-r-none"` →
     `className="rounded-r-none"`. Keep `rounded-r-none`; it is geometry, and rule 9 depends
     on it.

4. **The three primary submit `<Button>`s (6 palette, 3 raw).** Lines 387, 432, 505:
   `className="w-full bg-blue-600 hover:bg-blue-500 text-white"` → `className="w-full"`.
   The default variant is already `bg-primary text-primary-foreground hover:bg-primary/80`,
   which is the school-neutral brand fill the kit drives.

5. **The Google sign-in `<Button>`, line 293 (4 palette, 1 raw).**
   `className="w-full border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:text-white hover:bg-zinc-800"`
   → `className="w-full"`. It already carries `variant="outline"`, whose tokens are
   `border-border hover:bg-input/50 hover:text-foreground dark:bg-input/30` — the same
   treatment #771 landed on the school landing page's secondary CTA by deleting the override.
   Do **not** hand-map these to `border-border bg-muted/50 …`; that re-states the variant and
   drifts the moment the variant changes.

6. **Header badge and title, lines 257–261 (4 palette, 1 raw).**
   - Line 257: `bg-blue-500/10 … border border-blue-500/20` → `bg-brand-tint … border border-primary/20`.
   - Line 258 icon: `text-blue-400` → `text-brand-text`.
     Never `text-primary` on a tint — it fails AA for light brands (Kódigo).
   - Line 260 `<h1 className="text-3xl font-bold text-white">` → `text-3xl font-bold text-foreground`.
     This `<h1>` sits on the page shell, outside any `Card`, so make the ink explicit rather
     than relying on inheritance.
   - Line 261 `<p className="text-zinc-400 mt-2">` → `text-muted-foreground mt-2`.
   *(Same chip idiom as O1-wizard rule 3. See judgment call O2-create-school-4 on `/20` vs `/25`.)*

7. **Step indicator, lines 267–283 (8 palette).** Four ternaries, two states each. See
   judgment call **O2-create-school-1** before applying the `success` half.
   - Line 271, dot 1 fill: `step === 'school' ? 'bg-emerald-500' : 'bg-blue-500'`
     → `step === 'school' ? 'bg-success' : 'bg-primary'`
   - Line 273, label 1 ink: `step === 'school' ? 'text-emerald-400' : 'text-zinc-500'`
     → `step === 'school' ? 'text-success' : 'text-muted-foreground'`
   - Line 277, connector: `step === 'school' ? 'bg-blue-500' : 'bg-zinc-700'`
     → `step === 'school' ? 'bg-primary' : 'bg-border'`
   - Line 279, dot 2 fill: same pair → `bg-primary` : `bg-border`
   - Line 280, label 2 ink: `text-zinc-500` → `text-muted-foreground`
   Both labels are real translated strings (`stepSignedUp` / `stepAccount` / `stepSchool`), so
   the indicator never rests on colour alone. `bg-border` for the pending dot matches
   O1-wizard rule 2; if it washes out against `bg-background` on the platform default,
   fall back to `bg-muted-foreground/30` for **both** pending shapes together (dot and
   connector are one state and must not diverge).

8. **The "or email" divider, lines 317–323 (3 palette).**
   - Line 319: `border-t border-zinc-800` → `border-t border-border`.
   - Line 322: `bg-zinc-900 px-2 text-zinc-500` → `bg-card px-2 text-muted-foreground`.
   **`bg-card`, not `bg-background`.** This span's fill exists to mask the rule behind it, and
   the rule is drawn inside a `Card` — a `bg-background` span leaves the line visibly crossing
   the label in light mode, where `--card` and `--background` differ under a kit.

9. **The slug domain-suffix addon, line 494 (4 palette).** See judgment call
   **O2-create-school-3** first; if the orchestrator keeps the hand-rolled join, then:
   `px-3 py-2 bg-zinc-700 border border-l-0 border-zinc-700 rounded-r-md text-zinc-400 text-sm whitespace-nowrap`
   → `px-3 py-2 bg-muted border border-l-0 border-input rounded-r-md text-foreground text-sm whitespace-nowrap`.
   Two deliberate choices:
   - `border-input`, not `border-border` — the seam has to match the `<Input>` it is glued to,
     and rule 3 leaves that input on its own `border-input`.
   - `text-foreground`, not `text-muted-foreground` — this is the brief's 4.39:1 case.
     `text-muted-foreground` on `bg-muted` measures 4.39:1, under the 4.5:1 that 14px normal
     text needs, and the domain suffix is not decoration: the creator reads
     `myschool` + `.lmsplatform.com` together to understand the URL they are choosing.

10. **The stalled-Google hint, line 312 (1 palette).** `text-sm text-amber-400` →
    `text-sm text-warning`. It is a warning (Google did not respond), the `<p>` is its own
    text label with `role="status"`, and nothing about it rests on colour.

11. **The two error paragraphs, lines 383 and 501 (2 palette).** `text-sm text-red-400` →
    `text-sm text-destructive`. Same class both sites; keep them identical.

12. **The "check your email" badge, lines 419–420 (3 palette).** See judgment call
    **O2-create-school-2**. Recommended:
    - Line 419: `bg-emerald-500/10 … border border-emerald-500/20` → `bg-success/10 … border border-success/30`
    - Line 420 icon: `text-emerald-400` → `text-success`
    `/30` not `/20` on the border — that is the repo's settled status-border weight
    (`border-success/30` ×24 in #770, and O1-wizard rule 3 lands on it too).

13. **The confirm-step heading and body, lines 423–424 (1 palette, 1 raw).**
    - Line 423 `<h2 className="text-xl font-semibold text-white">` → `text-xl font-semibold`.
      Delete `text-white`; the `<h2>` is inside the `Card` and inherits `text-card-foreground`.
      (Deliberately different from rule 6's `<h1>`, which is outside any card.)
    - Line 424: `text-sm text-zinc-400` → `text-sm text-muted-foreground`.

14. **The "signed in as" panel, lines 458–460 (5 palette).**
    - Line 458: `bg-emerald-500/10 border border-emerald-500/20` → `bg-success/10 border border-success/30`
    - Line 459 icon: `text-emerald-400` → `text-success`
    - Line 460 text: `text-emerald-300` → `text-success`
    This is unambiguously a status (the account exists and is signed in), it keeps its
    `CheckCircle2` icon *and* a translated label, and it matches `join-school/page.tsx`'s
    already-swept member card (`bg-success/10 ring-success/30` + `text-success`) — the nearest
    sibling screen. Note the two emerald classes collapse to one `text-success`: the 400/300
    split only existed to stay legible on `bg-zinc-900`.

15. **The two ghost "back" `<Button>`s, lines 441 and 527 (2 palette, 2 palette hover).**
    `className="w-full text-zinc-500 hover:text-zinc-300"` →
    `className="w-full text-muted-foreground hover:text-foreground"` at **both** sites.
    Do not delete the whole override here (unlike rules 4 and 5): `variant="ghost"` sets no
    resting ink, so deleting would promote these to full-contrast and lose the deliberate
    de-emphasis of a secondary "go back" action next to a primary CTA. `hover:text-foreground`
    is what the ghost variant itself already declares, so the pair is self-consistent.

16. **No `dark:` pairs exist in this file.** Nothing to delete under the brief's `dark:` rule —
    the file was written dark-only, which is exactly the bug.

### Inline styles, hex constants, chart props

- **`style={{ … }}`: none.** Grepped; the file has no inline style objects and no colour
  constants in arrays. No Recharts, no `--chart-N` opportunity.
- **`fill="#4285F4"` / `#34A853` / `#FBBC05` / `#EA4335`, lines 302–305 — KEEP.**
  Google's own mark, drawn as four `<path>` elements inside the sign-in button. These are
  content, not chrome: Google's brand guidelines fix those four values, and a themed "G"
  is both wrong and a trademark problem. They are JSX attributes on `<path>`, so neither
  `ARBITRARY_COLOR` nor `WHITE_BLACK_CLASS` counts them and the file still lands at raw 0.
  **Do not "finish the sweep" by converting these.**
  Add this comment immediately above the `<svg>` (line 301), verbatim — it names no utility
  class, so it cannot bank a false allowance in the guard's source scan:

  ```
  {/* Google's own mark. The four path colours are fixed by Google's brand
      guidelines, so they are content and must not follow the school theme. */}
  ```

- `process.env.NEXT_PUBLIC_PLATFORM_DOMAIN` (line 495) and the `.lmsplatform.com` fallback
  carry no colour. Untouched.

### Not colour — do not change while in here

`data-testid` values (`create-school-google`, `create-school-google-stalled`,
`create-school-name`, `create-school-slug`, `create-school-submit`) are asserted by E2E
specs. Rules 3, 4 and 5 rewrite `className` on those exact elements — keep every
`data-testid`, `id`, `aria-label`, `required`, `disabled`, `autoFocus` and `minLength`
attribute byte-identical. No `useTranslations` key changes; no `messages/*.json` edit is
needed anywhere in this group.

---

# `app/[locale]/create-school/page.tsx`

**palette 0 · raw 1 → 0 / 0**

A 32-line server component. One colour, on the shell.

### Rules

1. **Line 22 (1 raw).**
   `className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4"` →
   `className="min-h-screen bg-background flex items-center justify-center p-4"`.
   Byte-for-byte the substitution #771 made on `components/public/school-landing-page.tsx`.
   Keep the class rather than dropping it: `min-h-screen` on this box is what fills the
   viewport when the form is short, and `body`'s own `bg-background` does not paint the
   centering box's own box model in every stacking case.

Nothing else in the file carries colour. `generateMetadata`, `getSessionUser` and the
`plan` / `interval` plumbing are untouched.

---

## Judgment calls

### O2-create-school-1 — does "signed up" stay green?
`components/tenant/create-school-flow.tsx`, lines 271 and 273 (rule 7).
The step-1 dot and label go green once the user has an account and blue while they are
still filling the form; the step-2 dot is blue-when-current, grey-when-pending. So the
indicator today speaks three colours: done, current, pending.
- **(a) Keep three states** — done `bg-success` / `text-success`, current `bg-primary`,
  pending `bg-border` / `text-muted-foreground`. Preserves the existing design intent exactly.
- **(b) Collapse to two** — done and current both `bg-primary`, pending `bg-border`, labels
  `text-muted-foreground` throughout. This is what `components/onboarding/onboarding-wizard.tsx`
  already does on master (its dots are `bg-blue-500` for reached, `bg-zinc-700` for upcoming,
  with no green at all), and what O1-wizard rule 2 plans for it.
**Recommendation: (a).** It is the mechanical mapping, it keeps a distinction the user can
act on ("your account is done, only the school is left"), and both labels are translated
strings so nothing rests on hue. The divergence from the onboarding wizard already exists on
master and (a) does not widen it.
**Why it matters:** these are the only two multi-step indicators in the product; if the
orchestrator wants one convention, this is the moment to set it, and (b) would have to be
applied to O1-wizard in the same PR.

### O2-create-school-2 — is "check your email" a success or an informational badge?
`components/tenant/create-school-flow.tsx`, lines 419–420 (rule 12).
A `Mail` icon in an emerald tile above "Confirm your email". Nothing has succeeded yet — the
user still has to go to their inbox — but the *send* succeeded.
- **(a) `bg-success/10` + `border-success/30` + `text-success`** — preserves the emerald,
  matches the "signed in as" panel two steps later (rule 14).
- **(b) `bg-brand-tint` + `border-primary/20` + `text-brand-text`** — treats it as the same
  informational chip as the `GraduationCap` header badge (rule 6), which would make every
  icon tile in this flow one shape and let the green mean only "done".
**Recommendation: (a).** It is the mechanical hue-preserving mapping, and `Mail` + the
`confirmTitle` string carry the meaning either way. (b) is defensible and arguably cleaner,
but it removes a colour distinction the current design chose deliberately.
**Why it matters:** if O1-wizard's judgment call 4 resolves toward "step chrome is uniformly
brand", this one should resolve the same way, and vice versa. The two files are the same flow
seen by the same user five minutes apart.

### O2-create-school-3 — recolour the slug addon, or replace it with `InputGroup`?
`components/tenant/create-school-flow.tsx`, lines 483–497 (rule 9).
The `.lmsplatform.com` suffix is a hand-rolled join: a `<div className="flex items-center gap-0">`
wrapping an `<Input className="rounded-r-none">` and a `<span>` faking the right half of the
control with `border-l-0` and a matching `rounded-r-md`.
- **(a) Recolour in place** — `bg-muted` + `border-input` + `text-foreground`, as rule 9 states.
  Three classes, zero structural risk.
- **(b) Replace with `InputGroup` + `InputGroupInput` + `InputGroupAddon align="inline-end"`
  + `InputGroupText`** — the primitive that exists for exactly this, already imported and
  already used 120 lines up for the password reveal. It would inherit the group's focus ring,
  its `border-input`, its `rounded-input` (kit-driven corner radius, #762), and the seam would
  stop being hand-maintained.
**Recommendation: (a) for this PR.** (b) is the better component but it is a structural
refactor inside a colour sweep, it changes the control's height (`InputGroup` is `h-7`) and it
touches an element an E2E spec grabs by `data-testid="create-school-slug"`.
**Why it matters:** (a) leaves a control whose corners will not follow a kit's `--radius-input`
while every other input on the screen does — a visible inconsistency on Kódigo, which sets a
distinct corner radius. Worth a follow-up issue if (a) wins.

### O2-create-school-4 — `border-primary/20` or `border-primary/25` on a brand tint chip?
`components/tenant/create-school-flow.tsx`, line 257 (rule 6).
Surface 2 shipped `bg-brand-tint text-brand-text border border-primary/25` on the course-detail
category chip (#771). The sibling O1-wizard plan writes `border border-primary/20` for the same
shape. Both read fine; they are simply two numbers for one idiom.
- **(a) `/20`** — converges with O1-wizard, which is the file this flow hands the user off to.
- **(b) `/25`** — converges with the already-merged #771 code.
**Recommendation: (a) `/20`**, and tell every surface-3 group the same number, since surface 3
is one PR and internal consistency inside it beats matching one line in a merged PR.
**Why it matters:** it is the only shape that repeats across several surface-3 groups; picking
late means a reviewer diffing two files in the same PR sees two answers.

### O2-create-school-5 — is `/create-school` product surface, or exempt platform marketing?
Both files.
The guard's `EXEMPT_PREFIXES` deliberately excludes platform marketing — `(public)/page.tsx`,
`creators/`, `about/`, `platform-pricing/`, `platform/`, `components/platform/` — on the
grounds that it is "redesigned with the platform brand, not a school's". `/create-school` is
the conversion target of `/platform-pricing` (it carries the `?plan=` / `?interval=` query
straight through), and it shares that surface's forced-dark look today. It is also tenant-less,
so no school's kit will ever reach it.
- **(a) Sweep it** (what this plan assumes). PRODUCT.md's register list names the brand-register
  exceptions explicitly and `/create-school` is not among them, so it is `product` register.
  `scripts/qa-staff-theme-matrix.ts:419` already lists `create-school` as a tier-B screen on
  the platform base URL, i.e. surface 3 was scoped to include it. And both files are in the
  baseline today, which is the sweep's own statement of intent.
- **(b) Add `app/[locale]/create-school/` to `EXEMPT_PREFIXES`** and leave the dark design
  alone until the platform marketing redesign reaches it, keeping the visual handoff from
  `/platform-pricing` seamless.
**Recommendation: (a).** Three independent signals (register list, matrix screen list,
baseline membership) say sweep, and the page's own job — a signed-in-adjacent form, not a
pitch — is product, not marketing.
**Why it matters:** this decides whether the group produces a diff at all, and (b) would mean
editing the guard's exemption list, which is a change every other surface-3 group's counts
depend on. It also changes what a reviewer expects from the QA screenshots: under (a) the
"after" shot of `/create-school` is a **light** page in light mode, which looks like a
regression if nobody said so up front.

---

## Cross-file findings

- `components/onboarding/onboarding-wizard.tsx` (group **O1-wizard**, not mine) carries the
  same two idioms as this file and should agree with it: the dot stepper (its lines 149–162,
  `bg-blue-500` reached / `bg-zinc-700` upcoming) and the emerald icon tile
  (`bg-emerald-500/10 … border border-emerald-500/20` at its lines 343 and 407). O1-wizard's
  plan already maps those to `bg-primary` / `bg-border` and `bg-success/10` /
  `border-success/30` / `text-success`, which matches rules 7, 12 and 14 here — except for the
  green "done" state (judgment call O2-create-school-1) and the chip border opacity
  (O2-create-school-4).
- Shared primitives are clean; no edits outside my file list are implied. `components/ui/card.tsx`,
  `button.tsx`, `input.tsx`, `label.tsx` and `input-group.tsx` are all absent from
  `palette-class-baseline.json` and read as fully tokenised. `sonner` (the `toast` on line 233)
  is likewise absent.
- `app/[locale]/join-school/page.tsx` is already at 0/0 (swept in #771) and is the nearest
  sibling screen. Rule 14's `bg-success/10` + `text-success` is copied from it, so the two
  tenant-entry screens will read the same.
- `app/[locale]/auth/*` shares the "dark card on a dark page" language with this file and is
  presumably another group's; if it is *not* in any group, `/create-school` will hand the user
  to `/auth/login` (line 405 and line 431) across a light-to-dark seam.

## Bugs noticed while reading (NOT to be fixed in this sweep)

- `components/tenant/create-school-flow.tsx:431` — `<Link href="…"><Button …></Link>`. CLAUDE.md
  is explicit that the base-ui `Button` takes no `asChild` and that a `<Link>` wrapper is the
  pattern, so this is intended; but it nests an interactive `<button>` inside an `<a>`, which
  is invalid HTML and is why Playwright needs `page.evaluate(() => btn.click())` on these.
  Cosmetic/a11y, low severity, and rule 4 touches the very same line — resist fixing it there.
- `components/tenant/create-school-flow.tsx:383,501` — the error paragraph has no
  `role="alert"` / `aria-live`, so a screen reader never hears a failed sign-up or a taken
  slug. The stalled-Google hint 70 lines up does carry `role="status"`. Rule 11 edits both
  error lines; adding the role there would be a real a11y fix but is out of scope for a colour
  sweep. Low-to-medium severity.
