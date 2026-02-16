'use client'

import { useState } from 'react'
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
                throw new Error(result.error || 'Failed to issue certificate')
            }

            if (result.success) {
                toast.success(`Certificate issued to ${studentName}`)
                setIsSuccess(true)
                router.refresh()
            } else {
                toast.error(result.reason || 'Student is not yet eligible for a certificate')
            }
        } catch (error: any) {
            console.error('Error issuing certificate:', error)
            toast.error(error.message || 'An error occurred while issuing the certificate')
        } finally {
            setIsLoading(false)
        }
    }

    if (isSuccess) {
        return (
            <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" disabled>
                <IconCheck className="mr-2 h-4 w-4" />
                Issued
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
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <IconAward className="mr-2 h-4 w-4" />
            )}
            Issue Certificate
        </Button>
    )
}
