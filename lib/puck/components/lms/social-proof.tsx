import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import type { LandingTestimonial, PuckMetadata } from '../../types'

export type SocialProofProps = {
  text: string
  rating: number
  reviewCount: string
  avatarCount: number
}

export const SocialProof: ComponentConfig<SocialProofProps> = {
  label: 'Social Proof',
  fields: {
    text: { type: 'text', label: 'Text' },
    rating: { type: 'number', label: 'Rating (1-5)', min: 1, max: 5 },
    reviewCount: { type: 'text', label: 'Review Count Text' },
    avatarCount: { type: 'number', label: 'Number of Avatars', min: 1, max: 8 },
  },
  defaultProps: {
    text: 'Trusted by 10,000+ students worldwide',
    rating: 5,
    reviewCount: 'Based on 2,000+ reviews',
    avatarCount: 5,
  },
  render: ({ text, rating, reviewCount, avatarCount, puck }) => {
    // Real course reviews resolved server-side and handed in via metadata. When present we
    // derive the rating (average), review count, and avatar initials from actual reviews;
    // otherwise fall back to the manually-entered values so the strip is never empty.
    const live = ((puck?.metadata as PuckMetadata | undefined)?.testimonials ?? []) as LandingTestimonial[]
    const rated = live.filter((tm) => tm.rating != null)

    const displayRating = rated.length > 0
      ? Math.round((rated.reduce((sum, tm) => sum + (tm.rating ?? 0), 0) / rated.length) * 10) / 10
      : rating
    const displayReviewCount = live.length > 0
      ? `Based on ${live.length} review${live.length === 1 ? '' : 's'}`
      : reviewCount
    const initials = live.length > 0
      ? live.slice(0, avatarCount).map((tm) => (tm.name?.trim()?.charAt(0) || '?').toUpperCase())
      : Array.from({ length: avatarCount }, (_, i) => String.fromCharCode(65 + i))

    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex">
          {initials.map((letter, i) => (
            <div
              key={i}
              className={cn(
                'size-9 rounded-full border-2 border-background flex items-center justify-center text-xs font-semibold bg-primary/20 text-primary',
                i > 0 && '-ml-2'
              )}
            >
              {letter}
            </div>
          ))}
        </div>
        <div className="flex gap-0.5">
          <span aria-hidden="true" className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'text-base',
                  i < displayRating ? 'text-amber-500' : 'text-muted-foreground/30'
                )}
              >
                ★
              </span>
            ))}
          </span>
          <span className="sr-only">{displayRating} out of 5 stars</span>
        </div>
        <p className="font-semibold text-[0.9375rem] text-foreground truncate">{text}</p>
        <p className="text-[0.8125rem] text-muted-foreground">{displayReviewCount}</p>
      </div>
    )
  },
}
