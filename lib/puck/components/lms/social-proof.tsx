import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

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
  render: ({ text, rating, reviewCount, avatarCount }) => {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex">
          {Array.from({ length: avatarCount }, (_, i) => (
            <div
              key={i}
              className={cn(
                'size-9 rounded-full border-2 border-background flex items-center justify-center text-xs font-semibold bg-primary/20 text-primary',
                i > 0 && '-ml-2'
              )}
            >
              {String.fromCharCode(65 + i)}
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
                  i < rating ? 'text-amber-500' : 'text-muted-foreground/30'
                )}
              >
                ★
              </span>
            ))}
          </span>
          <span className="sr-only">{rating} out of 5 stars</span>
        </div>
        <p className="font-semibold text-[0.9375rem] text-foreground truncate">{text}</p>
        <p className="text-[0.8125rem] text-muted-foreground">{reviewCount}</p>
      </div>
    )
  },
}
