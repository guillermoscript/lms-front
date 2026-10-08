/**
 * AI annotations for the shared section style tokens (Page Architect WP4, design §3.7 + E2/E4/E5).
 *
 * The tokens live on the shared section layer (`lib/puck/utils/section-spacing.ts` →
 * `section-style.ts`), so they sit under the `'*'` key and the catalog describes them ONCE.
 * Colours are never authored here: a tone re-scopes the school's theme-kit variables, so every
 * tone stays readable for every tenant palette. The school's theme itself (colour, corners) is
 * tenant-wide and out of reach of a page edit.
 *
 * Per-block visual variants (E4) are the enums those blocks ALREADY had; none were invented:
 *   - Banner.style                  brand | info | warning | success | urgent
 *   - CtaBlock.style                default | gradient | bordered
 *   - ContentFeature.imagePosition  left | right
 *   - HeroBlock.alignment           left | center | right
 *   - StatsCounter.alignment        left | center
 *   - FeaturesGrid / CourseGrid / CatalogBrowser / ImageGallery `columns`
 *   - LogoMarquee.reverse
 * The catalog already lists their enums; only the ones worth a nudge get a line here.
 *
 * Pure data only. Keep it short: the whole catalog prompt doc has a character budget.
 */
import type { AiAnnotations } from './types'

export const STYLE_ANNOTATIONS: AiAnnotations = {
  '*': {
    instructions:
      'Shared section fields. Leave spacing unset (defaults are tuned). Style with tokens, never colours.',
    fields: {
      tone: {
        instructions:
          'Background. Alternate default/muted; brand or inverse for 1-2 emphasis sections (CTA, stats). Always readable.',
      },
      align: { instructions: 'Keep default unless asked.' },
      anchorId: {
        instructions:
          'Lowercase slug (a-z, 0-9, -) for "#slug" links, e.g. about. Already set on the first of each type: faq, pricing, contact, team, features, courses, catalog, testimonials, curriculum, instructor, programs.',
      },
      hideOn: { instructions: 'Keep none unless asked.' },
    },
  },
  Banner: { instructions: '', fields: { style: { instructions: 'Visual variant.' } } },
  CtaBlock: { instructions: '', fields: { style: { instructions: 'Visual variant.' } } },
  ContentFeature: {
    instructions: '',
    fields: { imagePosition: { instructions: 'Alternate between consecutive ContentFeatures.' } },
  },
}

/** Alias under the name the WP4 brief uses. */
export const styleAnnotations = STYLE_ANNOTATIONS
