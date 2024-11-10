
import { useState } from 'react'
import { toast } from 'sonner'

import { saveUserSubmissionAction } from '@/actions/dashboard/exercisesActions'
import { useScopedI18n } from '@/app/locales/client'

export function useSaveCode(exerciseId: number) {
    const t = useScopedI18n('SaveCode')
    const [isLoading, setIsLoading] = useState(false)

    const saveCode = async (code: string) => {
        setIsLoading(true)
        try {
            const res = await saveUserSubmissionAction({
                exerciseId,
                submissionCode: code,
            })

            if (res.error) {
                toast.error(t('failedToSaveCode'))
                return
            }
            toast.success(t('codeSavedSuccessfully'))
        } catch (error) {
            console.error('Error:', error)
            toast.error(t('failedToSaveCode'))
        } finally {
            setIsLoading(false)
        }
    }

    return { saveCode, isLoading }
}
