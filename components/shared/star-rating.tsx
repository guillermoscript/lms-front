import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
    rating: number
    className?: string
    starClassName?: string
}

// Presentational 5-star display supporting fractional averages (partial fill
// via clipped overlay). Server-safe — no client hooks.
export function StarRating({ rating, className, starClassName }: StarRatingProps) {
    const clamped = Math.max(0, Math.min(5, rating))
    return (
        <div className={cn('flex items-center gap-0.5', className)} role="img" aria-label={`${clamped.toFixed(1)} / 5`}>
            {[0, 1, 2, 3, 4].map((i) => {
                const fill = Math.max(0, Math.min(1, clamped - i))
                return (
                    <span key={i} className="relative inline-flex">
                        <Star className={cn('w-4 h-4 text-zinc-600', starClassName)} aria-hidden="true" />
                        {fill > 0 && (
                            <span
                                className="absolute inset-0 overflow-hidden"
                                style={{ width: `${fill * 100}%` }}
                            >
                                <Star
                                    className={cn('w-4 h-4 text-amber-400 fill-amber-400', starClassName)}
                                    aria-hidden="true"
                                />
                            </span>
                        )}
                    </span>
                )
            })}
        </div>
    )
}
