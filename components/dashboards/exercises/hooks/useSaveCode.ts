
import { useState } from 'react'
import { toast } from 'sonner'

import { saveUserSubmissionAction } from '@/actions/dashboard/exercisesActions'
import { useScopedI18n } from '@/app/locales/client'

export function useSaveCode(exerciseId: number, initialCode: string) {
    const t = useScopedI18n('SaveCode')
    const [isLoading, setIsLoading] = useState(false)
    const [lastSavedCode, setLastSavedCode] = useState(initialCode)

    const saveCode = async (code: string) => {
        if (code === lastSavedCode) {
            console.log(code, 'code')
            console.log(lastSavedCode, 'lastSavedCode')
            toast.info(t('noChangesToSave'))
            return
        }
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
            setLastSavedCode(code)
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
