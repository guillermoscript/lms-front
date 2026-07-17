'use client'

import { useCallback, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { subscribeFree } from '@/app/[locale]/(public)/checkout/actions'
import { Button } from '@/components/ui/button'

interface FreeSubscribeProps {
    planId: number
    /** Whether the current visitor is signed in (decided server-side). */
    isAuthenticated: boolean
    /** Auto-fire once when the URL carries ?subscribe=<planId> and the user is signed in. */
    autoFire?: boolean
    className?: string
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
}: FreeSubscribeProps) {
    const t = useTranslations('pricing')

    if (!isAuthenticated) {
        return (
            <Link
                href={`/auth/login?next=${encodeURIComponent(`/pricing?subscribe=${planId}`)}`}
                className="block"
            >
                <Button className={className}>{t('subscribeFree')}</Button>
            </Link>
        )
    }

    return <FreeSubscribeTrigger planId={planId} autoFire={autoFire} className={className} />
}

function FreeSubscribeTrigger({
    planId,
    autoFire,
    className,
}: {
    planId: number
    autoFire: boolean
    className?: string
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
