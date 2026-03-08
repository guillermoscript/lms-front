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
}

export function IssueCertificateButton({
    courseId,
    userId,
    studentName,
    existingCertificateId
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
        } catch (error: any) {
            console.error('Error issuing certificate:', error)
            toast.error(error.message || t('issueGenericError'))
        } finally {
            setIsLoading(false)
        }
    }

    if (isSuccess) {
        return (
            <Button variant="ghost" size="sm" className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30" disabled>
                <IconCheck className="mr-2 h-4 w-4" />
                {t('issued')}
            </Button>
        )
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleIssue}
            disabled={isLoading}
            className="hover:border-primary hover:text-primary"
        >
            {isLoading ? (
                <IconLoader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
            ) : (
                <IconAward className="mr-2 h-4 w-4" />
            )}
            {t('issueCertificate')}
        </Button>
    )
}
