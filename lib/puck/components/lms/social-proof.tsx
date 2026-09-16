import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import type { LandingTestimonial, PuckMetadata } from '../../types'

export type SocialProofProps = {
  text: string
  reviewCount: string
  avatarCount: number
}

export const SocialProof: ComponentConfig<SocialProofProps> = {
  label: 'Social Proof',
  fields: {
    text: { type: 'text', label: 'Text' },
    reviewCount: { type: 'text', label: 'Review Count Text' },
    avatarCount: { type: 'number', label: 'Number of Avatars', min: 1, max: 8 },
  },
  // No invented counts in the defaults (#724): a school dropping this block on
  // a brand-new page used to publish "Trusted by 10,000+ students worldwide"
  // and "Based on 2,000+ reviews" as if they were its own numbers. The real
  // figures come from the course reviews resolved in `puck.metadata` below;
  // until there are any, the strip shows only what the school typed itself.
  // The manual "Rating (1-5)" field is gone with them: a hand-typed rating is
  // a claim about other people, and there is no honest value for it to hold.
  defaultProps: {
    text: '',
    reviewCount: '',
    avatarCount: 5,
  },
  render: ({ text, reviewCount, avatarCount, puck }) => {
    // Real course reviews resolved server-side and handed in via metadata: the
    // rating (average), the review count and the avatar initials all come from
    // them. The school's own `reviewCount` text is the only manual fallback.
    const live = ((puck?.metadata as PuckMetadata | undefined)?.testimonials ?? []) as LandingTestimonial[]
    const rated = live.filter((tm) => tm.rating != null)

    // Stars and avatars are claims, not decoration: five filled amber stars
    // and five "A"-"E" faces read exactly like a real 5-star rating, and a
    // screenshot of them is indistinguishable from one. Emptying the text
    // defaults (#724) left that picture behind, so both are drawn ONLY from
    // reviews that exist; `avatarCount` still caps the faces, it no longer
    // conjures them.
    const displayRating = rated.length > 0
      ? Math.round((rated.reduce((sum, tm) => sum + (tm.rating ?? 0), 0) / rated.length) * 10) / 10
      : null
    const displayReviewCount = live.length > 0
      ? `Based on ${live.length} review${live.length === 1 ? '' : 's'}`
      : reviewCount
    const initials = live.length > 0
      ? live.slice(0, avatarCount).map((tm) => (tm.name?.trim()?.charAt(0) || '?').toUpperCase())
      : []

    return (
      <div className="flex flex-col items-center gap-3">
        {initials.length > 0 ? (
          <div className="flex">
            {initials.map((letter, i) => (
              <div
                key={i}
                className={cn(
                  'size-9 rounded-full border-2 border-background flex items-center justify-center text-xs font-semibold bg-brand-tint text-brand-text',
                  i > 0 && '-ml-2'
                )}
              >
                {letter}
              </div>
            ))}
          </div>
        ) : null}
        {displayRating != null ? (
          <div className="flex gap-0.5">
            <span aria-hidden="true" className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'text-base',
                    i < displayRating ? 'text-warning' : 'text-muted-foreground/30'
                  )}
                >
                  ★
                </span>
              ))}
            </span>
            <span className="sr-only">{displayRating} out of 5 stars</span>
          </div>
        ) : null}
        {text ? (
          <p className="font-semibold text-[0.9375rem] text-foreground truncate">{text}</p>
        ) : null}
        {displayReviewCount ? (
          <p className="text-[0.8125rem] text-muted-foreground">{displayReviewCount}</p>
        ) : null}
      </div>
    )
  },
}
