'use client'
import MySandpack from '../Common/Editor/MySandpackEditor'

import {
    SandpackProvider,
} from '@codesandbox/sandpack-react'

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
