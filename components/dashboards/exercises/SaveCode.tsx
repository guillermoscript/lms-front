import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Code2, Settings, Check, Loader } from 'lucide-react'
import { useActiveCode } from '@codesandbox/sandpack-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { saveUserSubmissionAction } from '@/actions/dashboard/exercisesActions'

export default function SaveCode({
    exerciseId,
    isCompleted,
}: {
    exerciseId: number
    isCompleted: boolean
}) {
    const { code } = useActiveCode()
    const [isLoading, setIsLoading] = useState(false)
    const [lastSavedCode, setLastSavedCode] = useState(code)

    const saveCode = async () => {
        if (code === lastSavedCode) {
            toast.info('No changes to save')
            return
        }
        setIsLoading(true)
        try {
            const res = await saveUserSubmissionAction({
                exerciseId,
                submissionCode: code,
            })

            if (res.error) {
                toast.error('Failed to save code')
                return
            }
            setLastSavedCode(code)
            toast.success('Code saved successfully')
        } catch (error) {
            console.error('Error:', error)
            toast.error('Failed to save code')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="p-2 flex items-center justify-between border  rounded-lg mb-4">
            <div className="flex items-center space-x-2">
                <Badge variant="default">
                    <Code2 className="w-4 h-4 mr-1" />
                    JavaScript
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
                        <Settings className="w-4 h-4" />
                    )}
                </Button>
            </div>
        </div>
    )
}
