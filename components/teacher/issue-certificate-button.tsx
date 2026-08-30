'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { IconAward, IconLoader2, IconCheck } from '@tabler/icons-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface IssueCertificateButtonProps {
    courseId: number
    userId: string
    studentName: string
    existingCertificateId?: string
    /**
     * Icon-only, for dense rows where the label does not fit (the Students
     * tab table, #647). The label moves to `aria-label`/`title`; the full
     * button still appears in the student's detail sheet.
     */
    compact?: boolean
}

export function IssueCertificateButton({
    courseId,
    userId,
    studentName,
    existingCertificateId,
    compact = false,
}: IssueCertificateButtonProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(!!existingCertificateId)
    const router = useRouter()
    const t = useTranslations('dashboard.teacher.certificates')

    const handleIssue = async () => {
        if (isSuccess) return

        setIsLoading(true)
        try {
            const response = await fetch('/api/certificates/issue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    courseId,
                    userId
                }),
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || t('issueError'))
            }

            if (result.success) {
                toast.success(t('issueSuccess', { name: studentName }))
                setIsSuccess(true)
                router.refresh()
            } else {
                toast.error(result.reason || t('notEligible'))
            }
        } catch (error) {
            console.error('Error issuing certificate:', error)
            toast.error((error instanceof Error && error.message) || t('issueGenericError'))
        } finally {
            setIsLoading(false)
        }
    }

    if (isSuccess) {
        const label = t('issued')
        return (
            <Button
                variant="ghost"
                size={compact ? 'icon-sm' : 'sm'}
                className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30"
                disabled
                aria-label={compact ? label : undefined}
                title={compact ? label : undefined}
            >
                <IconCheck className={compact ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
                {!compact && label}
            </Button>
        )
    }

    const label = t('issueCertificate')
    return (
        <Button
            variant="outline"
            size={compact ? 'icon-sm' : 'sm'}
            onClick={handleIssue}
            disabled={isLoading}
            className="hover:border-primary hover:text-primary"
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
        >
            {isLoading ? (
                <IconLoader2 className={compact ? 'h-4 w-4 motion-safe:animate-spin' : 'mr-2 h-4 w-4 motion-safe:animate-spin'} />
            ) : (
                <IconAward className={compact ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
            )}
            {!compact && label}
        </Button>
    )
}
