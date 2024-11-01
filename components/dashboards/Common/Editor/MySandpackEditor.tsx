'use client'

import {
    SandpackLayout,
    SandpackPreview,
    SandpackStack,
    useActiveCode,
} from '@codesandbox/sandpack-react'
import { useState } from 'react'

import SaveCode from '../../exercises/SaveCode'
import CompletedMessage from './CompletedMessage'
import MonacoEditor from './MonacoEditor'
import TestCompletionHandler from './TestCompletionHandler'

interface MySandpackProps {
    autoHiddenFiles: boolean
    userCode?: string
    exerciseId: number
    isExerciseCompleted: boolean
}

export default function MySandpack({
    autoHiddenFiles,
    userCode,
    exerciseId,
    isExerciseCompleted,
}: MySandpackProps) {
    const [isCompleted, setIsCompleted] = useState(isExerciseCompleted)
    const { code } = useActiveCode()

    return (
        <>
            <SaveCode isCompleted={isCompleted} exerciseId={exerciseId} />
            {!isCompleted && (
                <SandpackLayout>
                    <MonacoEditor
                        readOnly={isCompleted}
                        userCode={userCode}
                    />
                    <SandpackStack style={{ height: '100vh', margin: 0 }}>
                        <>
                            <SandpackPreview style={{ height: '70%' }} />
                            <TestCompletionHandler
                                exerciseId={exerciseId}
                                code={code}
                                setIsCompleted={setIsCompleted}
                            />
                        </>
                    </SandpackStack>
                </SandpackLayout>
            )}
            {isCompleted && (
                <div className='flex flex-col gap-4 py-4'>
                    <CompletedMessage />
                    <MonacoEditor
                        readOnly={isCompleted}
                        userCode={userCode}
                    />
                </div>
            )}
        </>
    )
}
