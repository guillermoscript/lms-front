'use client'

import {
    SandpackConsole,
    SandpackLayout,
    SandpackPreview,
    SandpackStack,
    SandpackTests,
    useActiveCode,
} from '@codesandbox/sandpack-react'

import MonacoEditor from './MonacoEditor'
import SaveCode from '../../exercises/SaveCode'
import axios from 'axios'
import { useState } from 'react'
import { Star } from 'lucide-react'
import Confetti from '@/components/magicui/confetti'
import CompletedMessage from './CompletedMessage'
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
            {isCompleted && <Confetti />}
            <SaveCode isCompleted={isCompleted} exerciseId={exerciseId} />
            <SandpackLayout>
                <MonacoEditor
                    autoHiddenFiles={autoHiddenFiles}
                    readOnly={isCompleted}
                    userCode={userCode}
                />
                <SandpackStack style={{ height: '100vh', margin: 0 }}>
                    <SandpackPreview style={{ height: '70%' }} />
                    {isCompleted ? (
                        <CompletedMessage />
                    ) : (
                        <TestCompletionHandler
                            exerciseId={exerciseId}
                            code={code}
                            setIsCompleted={setIsCompleted}
                        />
                    )}
                </SandpackStack>
            </SandpackLayout>
        </>
    )
}
