'use client'
import {
    SandpackProvider,
} from '@codesandbox/sandpack-react'

import MySandpack from '../Common/Editor/MySandpackEditor'

export default function StudentExerciseCodeWrapper({
    exercise,
    files,
    isExerciseCompleted,
    exerciseId,
    userCode,
}: {
    exercise: any
    files: any
    isExerciseCompleted: boolean
    exerciseId: number
    userCode?: string
}) {
    return (
        <SandpackProvider
            files={files}
            theme="dark"
            template="test-ts"
            options={{
                activeFile: exercise.active_file,
                visibleFiles: exercise.visible_files,
            }}
        >
            <MySandpack
                autoHiddenFiles={true}
                userCode={userCode}
                exerciseId={exerciseId}
                isExerciseCompleted={isExerciseCompleted}
            />
        </SandpackProvider>
    )
}
