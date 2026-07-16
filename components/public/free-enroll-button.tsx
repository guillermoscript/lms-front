'use client'

import { useCallback, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { enrollFree } from '@/app/[locale]/(public)/checkout/actions'
import { Button } from '@/components/ui/button'

interface FreeEnrollButtonProps {
  courseId: number
  autoEnroll?: boolean
}

export function FreeEnrollButton({ courseId, autoEnroll = false }: FreeEnrollButtonProps) {
  const router = useRouter()
  const t = useTranslations('coursePublicDetails.pricing')
  const hasAutoEnrolled = useRef(false)
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

  useEffect(() => {
    if (!autoEnroll || hasAutoEnrolled.current) return
    hasAutoEnrolled.current = true
    enroll()
  }, [autoEnroll, enroll])

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
