import { useActiveCode } from '@codesandbox/sandpack-react'
import { Check, Code2, Loader, Settings } from 'lucide-react'
import { useEffect } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { useSaveCode } from './hooks/useSaveCode'

export default function SaveCode({
    exerciseId,
    isCompleted,
}: {
    exerciseId: number
    isCompleted: boolean
}) {
    const t = useScopedI18n('SaveCode')
    const { code } = useActiveCode()
    const { saveCode, isLoading } = useSaveCode(exerciseId, code)

    useEffect(() => {
        console.log('code', code)
    }, [code])

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
                    onClick={async () => await saveCode(code)}
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
