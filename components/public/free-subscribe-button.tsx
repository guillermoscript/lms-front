'use client'

import { useCallback, useEffect, useRef, useTransition, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { subscribeFree } from '@/app/[locale]/(public)/checkout/actions'
import { Button } from '@/components/ui/button'
import { AlreadyHaveAccountLink } from '@/components/public/already-have-account-link'

interface FreeSubscribeProps {
    planId: number
    /** Whether the current visitor is signed in (decided server-side). */
    isAuthenticated: boolean
    /** Auto-fire once when the URL carries ?subscribe=<planId> and the user is signed in. */
    autoFire?: boolean
    className?: string
    /** Button variant, threaded from the pricing CTA so both CTAs match (#764). */
    variant?: ComponentProps<typeof Button>['variant']
}

function useFreeSubscription(planId: number) {
    const router = useRouter()
    const t = useTranslations('pricing')
    const [isPending, startTransition] = useTransition()

    const subscribe = useCallback(() => {
        startTransition(async () => {
            try {
                await subscribeFree(String(planId))
                toast.success(t('subscribeSuccess'))
                router.push('/dashboard/student/browse?checkout=success')
            } catch (error) {
                toast.error(error instanceof Error ? error.message : t('subscribeError'))
            }
        })
    }, [planId, router, t])

    return { subscribe, isPending }
}

export function FreeSubscribeButton({
    planId,
    isAuthenticated,
    autoFire = false,
    className,
    variant,
}: FreeSubscribeProps) {
    const t = useTranslations('pricing')

    if (!isAuthenticated) {
        // The free plan is the entry point for someone who has never signed up,
        // so the button goes to sign-up rather than a login form they cannot
        // fill (#719). Both links carry the same `next`, which brings them back
        // here with `?subscribe=` so `autoFire` finishes the subscription.
        const anonymousNext = `/pricing?subscribe=${planId}`
        return (
            <div className="space-y-2">
                <Link
                    data-testid={`subscribe-free-${planId}`}
                    href={`/auth/sign-up?next=${encodeURIComponent(anonymousNext)}`}
                    className="block"
                >
                    <Button variant={variant} className={className}>{t('subscribeFree')}</Button>
                </Link>
                <AlreadyHaveAccountLink
                    next={anonymousNext}
                    testId={`subscribe-free-login-${planId}`}
                    linkClassName="text-brand-text"
                />
            </div>
        )
    }

    return <FreeSubscribeTrigger planId={planId} autoFire={autoFire} className={className} variant={variant} />
}

function FreeSubscribeTrigger({
    planId,
    autoFire,
    className,
    variant,
}: {
    planId: number
    autoFire: boolean
    className?: string
    variant?: ComponentProps<typeof Button>['variant']
}) {
    const t = useTranslations('pricing')
    const { subscribe, isPending } = useFreeSubscription(planId)
    const hasStarted = useRef(false)

    useEffect(() => {
        if (!autoFire || hasStarted.current) return
        hasStarted.current = true
        subscribe()
    }, [autoFire, subscribe])

    return (
        <Button
            type="button"
            variant={variant}
            className={className}
            onClick={subscribe}
            disabled={isPending}
        >
            {isPending ? (
                <span className="flex items-center gap-2">
                    <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('subscribing')}
                </span>
            ) : (
                t('subscribeFree')
            )}
        </Button>
    )
}
