import { useActiveCode } from '@codesandbox/sandpack-react'
import { Check, Code2, Loader, Settings } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { saveUserSubmissionAction } from '@/actions/dashboard/exercisesActions'
import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function SaveCode({
    exerciseId,
    isCompleted,
}: {
    exerciseId: number
    isCompleted: boolean
}) {
    const t = useScopedI18n('SaveCode')
    const { code } = useActiveCode()
    const [isLoading, setIsLoading] = useState(false)
    const [lastSavedCode, setLastSavedCode] = useState(code)

    const saveCode = async () => {
        if (code === lastSavedCode) {
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

    return (
        <div className="p-2 flex items-center justify-between border  rounded-lg mb-4">
            <div className="flex items-center space-x-2">
                <Badge variant="default">
                    <Code2 className="w-4 h-4 mr-1" />
                    {t('javascript')}
                </Badge>
            </div>
            <div className="flex items-center space-x-2">
                <Button
                    onClick={saveCode}
                    variant="secondary"
                    size="sm"
                    disabled={isCompleted || isLoading}
                >
                    {isCompleted ? (
                        <Check className="w-4 h-4" />
                    ) : isLoading ? (
                        <Loader className="w-4 h-4" />
                    ) : (
                        <>
                            {t('save')}
                            <Settings className="w-4 h-4 ml-2" />
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
