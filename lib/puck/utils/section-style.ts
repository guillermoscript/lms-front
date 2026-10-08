import type { CSSProperties } from 'react'

/**
 * Section style tokens shared by every spaced landing block (Page Architect
 * WP4, design §3.7 + corrections E1/E2/E3).
 *
 * These are TOKENS, never colours: a section picks a `tone` and the colours
 * still come from the school's theme kit (`lib/themes/kit.ts`), so a tone
 * stays readable for every tenant palette in light and dark mode
 * (`tests/unit/section-tone-contrast.test.ts` computes it).
 *
 * How a tone works. Blocks hardcode `text-foreground`, `bg-card`,
 * `text-muted-foreground`, `border-border`… so painting a background alone
 * would leave dark text on a brand fill. Instead the tone RE-SCOPES the theme
 * variables for everything inside the section. That takes the two wrappers a
 * block already renders (`sectionOuterProps` + `sectionInnerProps`, never a
 * third `<section>` — E1/E2):
 *
 *  - the OUTER wrapper paints the surface from the inherited (page) variables
 *    and captures every page variable the tone reads into `--tone-src-*`;
 *  - the INNER wrapper redefines `--background`, `--foreground`, `--card`, …
 *    from those captures.
 *
 * The capture step is not optional: `--primary: var(--primary-foreground)`
 * next to `--primary-foreground: var(--primary)` on ONE element is a cycle,
 * and CSS turns both into the guaranteed-invalid value. Reading the page
 * value from the parent's capture is what lets `brand` swap the pair.
 *
 * Pure module (no React runtime, no theme-kit import) so the AI catalog,
 * codegen and unit tests can read it.
 */

// ─── Token enums ────────────────────────────────────────────────────────────

export const SECTION_TONES = ['default', 'muted', 'brand-tint', 'brand', 'inverse'] as const
export type SectionTone = (typeof SECTION_TONES)[number]

/** `default` keeps the block's own designed alignment. */
export const SECTION_ALIGNS = ['default', 'start', 'center'] as const
export type SectionAlign = (typeof SECTION_ALIGNS)[number]

export const SECTION_HIDE_ON = ['none', 'mobile', 'desktop'] as const
export type SectionHideOn = (typeof SECTION_HIDE_ON)[number]

export type SectionStyleProps = {
  tone: SectionTone
  align: SectionAlign
  /** Slug used as the section's DOM id, so `#faq`-style links scroll to it. */
  anchorId: string
  hideOn: SectionHideOn
}

export const sectionStyleDefaults: SectionStyleProps = {
  tone: 'default',
  align: 'default',
  anchorId: '',
  hideOn: 'none',
}

export function isSectionTone(v: unknown): v is SectionTone {
  return typeof v === 'string' && (SECTION_TONES as readonly string[]).includes(v)
}
export function isSectionAlign(v: unknown): v is SectionAlign {
  return typeof v === 'string' && (SECTION_ALIGNS as readonly string[]).includes(v)
}
export function isSectionHideOn(v: unknown): v is SectionHideOn {
  return typeof v === 'string' && (SECTION_HIDE_ON as readonly string[]).includes(v)
}

// ─── Anchors ────────────────────────────────────────────────────────────────

/** A valid anchor: lowercase letter first, then letters, digits, single dashes. ≤ 64 chars. */
export const ANCHOR_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const ANCHOR_ID_MAX = 64

/** Whether `v` is already a valid anchor slug (the server validator's rule). */
export function isValidAnchorId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= ANCHOR_ID_MAX && ANCHOR_ID_PATTERN.test(v)
}

/**
 * Normalises whatever a human or the AI typed into a usable anchor slug, or
 * `undefined` when nothing usable is left. Accents are folded (`Preguntas
 * frecuentes` → `preguntas-frecuentes`), a leading `#` is dropped, and a slug
 * that would start with a digit is rejected because it cannot be used in a
 * plain `#id` CSS selector.
 */
export function normalizeAnchorId(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const slug = v
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ANCHOR_ID_MAX)
    .replace(/-+$/g, '')
  return isValidAnchorId(slug) ? slug : undefined
}

/**
 * Anchor a block answers to when the author set none, so the `#faq`,
 * `#pricing`, `#contact`… links every template's header and footer already
 * carry land somewhere. Applied by `withDefaultAnchors()`: only the FIRST
 * block of a type gets it, and never when another block already claims the
 * slug, so DOM ids stay unique.
 */
export const DEFAULT_SECTION_ANCHORS: Readonly<Record<string, string>> = {
  FaqAccordion: 'faq',
  FaqSplit: 'faq',
  PricingTable: 'pricing',
  ContactForm: 'contact',
  TeamGrid: 'team',
  FeaturesGrid: 'features',
  CourseGrid: 'courses',
  CatalogBrowser: 'catalog',
  TestimonialGrid: 'testimonials',
  CourseCurriculum: 'curriculum',
  CoursePricingCard: 'pricing',
  InstructorCard: 'instructor',
  ProductGrid: 'programs',
}

type AnchorItem = { type: string; props?: Record<string, unknown> }
type AnchorData = { content?: AnchorItem[]; zones?: Record<string, AnchorItem[]> }

/**
 * Returns `data` with type-based default anchors filled in (see
 * `DEFAULT_SECTION_ANCHORS`). Walks `content` then every zone in document
 * order; explicit, valid `anchorId`s are kept and reserve their slug. Items
 * that change are shallow-copied; `data` itself is never mutated, and the same
 * object comes back when there is nothing to add.
 */
export function withDefaultAnchors<T extends AnchorData>(data: T): T {
  const lists: AnchorItem[][] = [data.content ?? [], ...Object.values(data.zones ?? {})]
  const taken = new Set<string>()
  for (const list of lists) {
    for (const item of list) {
      const own = normalizeAnchorId(item?.props?.anchorId)
      if (own) taken.add(own)
    }
  }

  let changed = false
  const fill = (list: AnchorItem[]): AnchorItem[] => {
    let out: AnchorItem[] | null = null
    list.forEach((item, i) => {
      const fallback = item && DEFAULT_SECTION_ANCHORS[item.type]
      if (!fallback || taken.has(fallback) || normalizeAnchorId(item.props?.anchorId)) return
      taken.add(fallback)
      out ??= [...list]
      out[i] = { ...item, props: { ...item.props, anchorId: fallback } }
    })
    if (out) changed = true
    return out ?? list
  }

  const content = fill(data.content ?? [])
  const zones = data.zones
    ? Object.fromEntries(Object.entries(data.zones).map(([key, list]) => [key, fill(list ?? [])]))
    : undefined
  if (!changed) return data
  return { ...data, ...(data.content ? { content } : {}), ...(zones ? { zones } : {}) }
}

// ─── Tones ──────────────────────────────────────────────────────────────────

/** A theme variable name without the leading `--`, e.g. `primary-foreground`. */
export type ThemeVar = string

/**
 * One re-scoped value: either another page variable, or a `color-mix` of two
 * page variables in OKLCH (`pctA` percent of `a`, the rest `b`).
 */
export type ToneExpr = { from: ThemeVar } | { mix: { a: ThemeVar; pctA: number; b: ThemeVar } }

export interface ToneDefinition {
  /** Page variable the section fill is painted from. */
  surface: ThemeVar
  /** Page variable for the section's base ink. */
  ink: ThemeVar
  /** Theme variables redefined inside the section. Anything absent inherits. */
  vars: Readonly<Record<ThemeVar, ToneExpr>>
}

const from = (v: ThemeVar): ToneExpr => ({ from: v })
const mix = (a: ThemeVar, pctA: number, b: ThemeVar): ToneExpr => ({ mix: { a, pctA, b } })

/**
 * The four non-default tones. Each one re-scopes the surface/ink pairs the
 * blocks use (`background`/`foreground`, `card`, `popover`, `muted`,
 * `secondary`, `accent`, `border`, `input`) and, where the page value would
 * vanish into the new surface, the brand pair (`primary`, `brand-text`,
 * `brand-tint`, `ring`).
 */
export const TONE_DEFINITIONS: Readonly<Record<Exclude<SectionTone, 'default'>, ToneDefinition>> = {
  // A quiet band: the page's muted surface. Cards stay cards; chips that used
  // `bg-muted` take the page colour so they still separate from the band.
  muted: {
    surface: 'muted',
    ink: 'foreground',
    vars: {
      background: from('muted'),
      muted: from('background'),
      secondary: from('background'),
      accent: from('background'),
      // The kit tunes --brand-text for the page, card and tint, not for muted:
      // pull it a quarter of the way toward the ink.
      'brand-text': mix('brand-text', 75, 'foreground'),
    },
  },
  // The kit's brand tint (card mixed toward the brand). Muted copy is pulled
  // toward the ink because the tint is a step darker than the page.
  'brand-tint': {
    surface: 'brand-tint',
    ink: 'foreground',
    vars: {
      background: from('brand-tint'),
      'muted-foreground': mix('foreground', 80, 'muted-foreground'),
    },
  },
  // A full brand fill. The button pair swaps so a primary button reads as an
  // inverted pill on the fill. Every surface stays the fill itself (cards and
  // chips are told apart by their border): the kit only guarantees AA for the
  // ink on the exact brand colour, and any tint toward the ink eats into it.
  brand: {
    surface: 'primary',
    ink: 'primary-foreground',
    vars: {
      background: from('primary'),
      foreground: from('primary-foreground'),
      card: from('primary'),
      'card-foreground': from('primary-foreground'),
      popover: from('primary'),
      'popover-foreground': from('primary-foreground'),
      muted: from('primary'),
      'muted-foreground': from('primary-foreground'),
      secondary: from('primary'),
      'secondary-foreground': from('primary-foreground'),
      accent: from('primary'),
      'accent-foreground': from('primary-foreground'),
      border: mix('primary-foreground', 35, 'primary'),
      input: mix('primary-foreground', 35, 'primary'),
      primary: from('primary-foreground'),
      'primary-foreground': from('primary'),
      'brand-text': from('primary-foreground'),
      'brand-tint': from('primary'),
      ring: from('primary-foreground'),
    },
  },
  // The page read back: ink becomes the surface. Brand-coloured text is
  // rebuilt as a light (or dark) tint of the brand over the new surface,
  // because the page's `--brand-text` was tuned for the opposite one.
  inverse: {
    surface: 'foreground',
    ink: 'background',
    vars: {
      background: from('foreground'),
      foreground: from('background'),
      card: mix('background', 9, 'foreground'),
      'card-foreground': from('background'),
      popover: mix('background', 9, 'foreground'),
      'popover-foreground': from('background'),
      muted: mix('background', 14, 'foreground'),
      'muted-foreground': mix('background', 80, 'foreground'),
      secondary: mix('background', 14, 'foreground'),
      'secondary-foreground': from('background'),
      accent: mix('background', 14, 'foreground'),
      'accent-foreground': from('background'),
      border: mix('background', 22, 'foreground'),
      input: mix('background', 22, 'foreground'),
      'brand-text': mix('brand', 30, 'background'),
      'brand-tint': mix('brand', 22, 'foreground'),
      ring: mix('brand', 30, 'background'),
    },
  },
}

/** Every page variable a tone reads (and the outer wrapper must capture). */
export function toneSources(def: ToneDefinition): ThemeVar[] {
  const out = new Set<ThemeVar>()
  for (const expr of Object.values(def.vars)) {
    if ('from' in expr) out.add(expr.from)
    else {
      out.add(expr.mix.a)
      out.add(expr.mix.b)
    }
  }
  return [...out].sort()
}

const capture = (v: ThemeVar) => `--tone-src-${v}`

function exprToCss(expr: ToneExpr): string {
  if ('from' in expr) return `var(${capture(expr.from)})`
  const { a, pctA, b } = expr.mix
  return `color-mix(in oklch, var(${capture(a)}) ${pctA}%, var(${capture(b)}))`
}

type CssVars = CSSProperties & Record<`--${string}`, string>

/** Outer-wrapper style for a tone: the fill, the base ink, and the captures. */
export function toneOuterStyle(tone: unknown): CssVars | undefined {
  if (!isSectionTone(tone) || tone === 'default') return undefined
  const def = TONE_DEFINITIONS[tone]
  const style: CssVars = {
    backgroundColor: `var(--${def.surface})`,
    color: `var(--${def.ink})`,
  }
  for (const v of toneSources(def)) style[capture(v) as `--${string}`] = `var(--${v})`
  return style
}

/** Inner-wrapper style for a tone: the re-scoped theme variables. */
export function toneInnerStyle(tone: unknown): CssVars | undefined {
  if (!isSectionTone(tone) || tone === 'default') return undefined
  const def = TONE_DEFINITIONS[tone]
  const style: CssVars = {}
  for (const [name, expr] of Object.entries(def.vars)) style[`--${name}`] = exprToCss(expr)
  style.color = 'var(--foreground)'
  return style
}

/**
 * Resolves a tone against a concrete palette (`--name` → colour), the way the
 * browser would, using `mixColors(b, a, pctA/100)` for each `color-mix`.
 * Returns the palette a block inside the section sees. Used by the contrast
 * test with the theme kit's real derivation; never at render time.
 */
export function resolveTonePalette(
  tone: SectionTone,
  palette: Readonly<Record<string, string>>,
  mixColors: (from: string, to: string, t: number) => string | null
): Record<string, string> {
  if (tone === 'default') return { ...palette }
  const def = TONE_DEFINITIONS[tone]
  const read = (v: ThemeVar) => {
    const value = palette[`--${v}`]
    if (!value) throw new Error(`palette has no --${v}`)
    return value
  }
  const out: Record<string, string> = { ...palette }
  for (const [name, expr] of Object.entries(def.vars)) {
    if ('from' in expr) out[`--${name}`] = read(expr.from)
    else {
      const mixed = mixColors(read(expr.mix.b), read(expr.mix.a), expr.mix.pctA / 100)
      if (!mixed) throw new Error(`cannot mix --${expr.mix.a} into --${expr.mix.b}`)
      out[`--${name}`] = mixed
    }
  }
  return out
}

// ─── Class maps ─────────────────────────────────────────────────────────────

/**
 * `start` pulls the block's centred heading group to the start edge (blocks
 * hardcode `text-center` / `mx-auto` on it); `center` centres any copy the
 * block left unaligned. `default` leaves the block's design alone.
 */
const ALIGN_CLASS: Record<SectionAlign, string> = {
  default: '',
  start: 'text-start [&_.text-center]:text-start [&_.mx-auto.text-center]:ms-0 [&_p.mx-auto]:ms-0',
  center: 'text-center',
}

/** Below `md` is "mobile", matching the editor's viewport switcher. */
const HIDE_ON_CLASS: Record<SectionHideOn, string> = {
  none: '',
  mobile: 'max-md:hidden',
  desktop: 'md:hidden',
}

export function alignClass(align: unknown): string {
  return isSectionAlign(align) ? ALIGN_CLASS[align] : ''
}

export function hideOnClass(hideOn: unknown): string {
  return isSectionHideOn(hideOn) ? HIDE_ON_CLASS[hideOn] : ''
}

/** Leaves room for a sticky Header when an anchor link scrolls to the section. */
export const ANCHOR_SCROLL_CLASS = 'scroll-mt-20'
