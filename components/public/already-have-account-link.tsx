'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/**
 * The secondary "Already have an account? Log in" line that sits under a public
 * CTA pointing at sign-up (#685, #719).
 *
 * Public entry points send a first-time visitor to `/auth/sign-up` — the person
 * who arrived by a shared link most likely has no account yet — and this link
 * carries the *same* `next` for the returning student. Passing the destination
 * once, to both, is what keeps the two from drifting apart.
 *
 * A client component so the pricing card (client) and the course/product pages
 * (server) can share one copy; `common.haveAccount` / `common.logIn` reach the
 * browser through the layout's `NextIntlClientProvider`.
 */
export function AlreadyHaveAccountLink({
    next,
    testId,
    className,
    linkClassName,
}: {
    /** Same relative path the sign-up button carries as `?next=`. */
    next: string
    testId?: string
    className?: string
    linkClassName?: string
}) {
    const t = useTranslations('common')

    return (
        <p className={cn('text-center text-xs text-muted-foreground', className)}>
            {t('haveAccount')}{' '}
            <Link
                data-testid={testId}
                href={`/auth/login?next=${encodeURIComponent(next)}`}
                className={cn('font-medium text-primary hover:underline', linkClassName)}
            >
                {t('logIn')}
            </Link>
        </p>
    )
}
