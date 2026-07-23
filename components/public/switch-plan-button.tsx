'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { changePlan } from '@/app/[locale]/(public)/checkout/actions'
import { Button } from '@/components/ui/button'

/**
 * Self-service "switch to this plan" CTA (#463) — replaces the old dead-end
 * "contact your school" copy on the parallel-subscription conflict notice.
 */
export function SwitchPlanButton({ planId }: { planId: number }) {
    const t = useTranslations('pricing')
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleSwitch = () => {
        startTransition(async () => {
            try {
                await changePlan(String(planId))
                toast.success(t('switchSuccess'))
                router.push('/dashboard/student/billing')
                router.refresh()
            } catch (error) {
                toast.error(error instanceof Error ? error.message : t('switchError'))
            }
        })
    }

    return (
        <Button type="button" onClick={handleSwitch} disabled={isPending}>
            {isPending ? (
                <span className="flex items-center gap-2">
                    <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('switching')}
                </span>
            ) : (
                t('switchToThis')
            )}
        </Button>
    )
}
