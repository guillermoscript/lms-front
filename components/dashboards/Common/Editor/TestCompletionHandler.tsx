import { SandpackConsole, SandpackTests, useActiveCode } from '@codesandbox/sandpack-react'
import axios from 'axios'

import { useSaveCode } from '../../exercises/hooks/useSaveCode'

interface TestCompletionHandlerProps {
    exerciseId: number
    setIsCompleted: (completed: boolean) => void
}

const allTestsPassed = (results: any) => {
    for (const file in results) {
        const fileResults = results[file]
        for (const describeKey in fileResults.describes) {
            const describe = fileResults.describes[describeKey]
            for (const testKey in describe.tests) {
                if (describe.tests[testKey].status !== 'pass') {
                    return false
                }
            }
        }
        for (const testKey in fileResults.tests) {
            if (fileResults.tests[testKey].status !== 'pass') {
                return false
            }
        }
    }
    return true
}

export default function TestCompletionHandler({
    exerciseId,
    setIsCompleted,
}: TestCompletionHandlerProps) {
    const { code } = useActiveCode()
    const { saveCode, isLoading } = useSaveCode(exerciseId, code)

    return (
        <>
            <SandpackTests
                style={{ height: '30%' }}
                // hideTestsAndSupressLogs
                watchMode={false}
                onComplete={async (results) => {
                    if (allTestsPassed(results)) {
                        try {
                            const res = await axios.post('/api/exercises/code', {
                                exerciseId,
                                submissionCode: code,
                            })
                            console.log(res)
                            setIsCompleted(true)
                        } catch (error) {
                            console.error('Error:', error)
                        }
                    } else {
                        console.log('Some tests did not pass.')
                        await saveCode(code)
                    }
                }}
                verbose={true}
            />
            {isLoading && <div>Saving...</div>}
            <SandpackConsole
                style={{ height: '20%' }}
                // hideTestsAndSupressLogs
            />
        </>
    )
}
