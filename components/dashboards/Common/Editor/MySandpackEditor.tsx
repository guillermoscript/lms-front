'use client'

import {
    SandpackStack,
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

    return (
        <>
            <SaveCode isCompleted={isCompleted} exerciseId={exerciseId} />
            {!isCompleted && (
                <SandpackStack style={{ height: '100vh', margin: 0 }}>
                    <MonacoEditor
                        readOnly={isCompleted}
                        userCode={userCode}
                    />
                    <>
                        <TestCompletionHandler
                            exerciseId={exerciseId}
                            setIsCompleted={setIsCompleted}
                        />
                    </>
                </SandpackStack>
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
