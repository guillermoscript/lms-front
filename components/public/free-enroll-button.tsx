'use client'

import { useCallback, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { enrollFree } from '@/app/[locale]/(public)/checkout/actions'
import { Button } from '@/components/ui/button'

interface FreeEnrollProps {
  courseId: number
}

function useFreeEnrollment(courseId: number) {
  const router = useRouter()
  const t = useTranslations('coursePublicDetails.pricing')
  const [isPending, startTransition] = useTransition()

  const enroll = useCallback(() => {
    startTransition(async () => {
      try {
        await enrollFree(String(courseId))
        toast.success(t('enrollmentSuccess'))
        router.push(`/dashboard/student/courses/${courseId}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('enrollmentError'))
      }
    })
  }, [courseId, router, t])

  return { enroll, isPending }
}

export function FreeEnrollButton({ courseId }: FreeEnrollProps) {
  const { enroll, isPending } = useFreeEnrollment(courseId)

  return <FreeEnrollTrigger enroll={enroll} status={isPending ? 'pending' : 'idle'} />
}

export function AutoFreeEnrollButton({ courseId }: FreeEnrollProps) {
  const { enroll, isPending } = useFreeEnrollment(courseId)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true
    enroll()
  }, [enroll])

  return <FreeEnrollTrigger enroll={enroll} status={isPending ? 'pending' : 'idle'} />
}

function FreeEnrollTrigger({
  enroll,
  status,
}: {
  enroll: () => void
  status: 'idle' | 'pending'
}) {
  const t = useTranslations('coursePublicDetails.pricing')
  const isPending = status === 'pending'

  return (
    <Button
      type="button"
      className="h-11 w-full bg-cyan-500 text-sm font-bold text-black shadow-lg shadow-cyan-500/20 hover:bg-cyan-400"
      onClick={enroll}
      disabled={isPending}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('enrolling')}
        </span>
      ) : (
        t('enrollFree')
      )}
    </Button>
  )
}
