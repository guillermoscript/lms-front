'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { toast } from 'sonner'

import Confetti from '@/components/magicui/confetti'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Dynamically import the code editor to avoid SSR issues
const CodeEditor = dynamic(async () => await import('./CodeEditor'), { ssr: false })

const ExerciseCode = ({ initialCode, tests }) => {
    const [code, setCode] = useState(initialCode)

    return (
        <Card>
            <CardHeader>
                <CardTitle>Exercise Section</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col  gap-4">
                <CodeEditor initialCode={code} onChange={setCode} />
                <CodeRunner code={code} tests={[
                    {
                        id: 1,
                        functionName: 'sum',
                        input: '1, 2',
                        expected: 3
                    },
                    {
                        id: 2,
                        functionName: 'sum',
                        input: '-1, 1',
                        expected: 0
                    },
                    {
                        id: 3,
                        functionName: 'sum',
                        input: '0, 0',
                        expected: 0
                    },
                    {
                        id: 4,
                        functionName: 'sum',
                        input: '100, 200',
                        expected: 300
                    }
                ]}
                />
            </CardContent>
        </Card>
    )
}

export default ExerciseCode

const CodeRunner = ({ code, tests }) => {
    const [output, setOutput] = useState('')
    const [error, setError] = useState('')
    const [allTestsPassed, setAllTestsPassed] = useState(false)

    // Function to wrap the user's code with test code logic
    const generateTestSuite = (userCode, tests) => {
        const testCode = `
        function runTests() {
            const testResults = [];
            ${tests.map(test => `
              try {
                let result = ${test.functionName}(${test.input});
                if (result === ${test.expected}) {
                  testResults.push('Test ${test.id} passed');
                } else {
                  testResults.push('Test ${test.id} failed: Expected ${test.expected}, but got ' + result);
                }
              } catch (err) {
                testResults.push('Test ${test.id} failed: Exception ' + err.message);
              }
            `).join('')}
            const allPassed = testResults.every(result => result.includes('passed'));
            if (allPassed) {
              testResults.push('All tests passed successfully!');
            }
            console.log(testResults.join('\\n'));
        }

        runTests();
        `
        return `${userCode}\n${testCode}`
    }

    const executeTestSuite = async () => {
        setOutput('')
        setError('')
        setAllTestsPassed(false)

        const fullCode = generateTestSuite(code, tests)

        const data = JSON.stringify({
            language: 'javascript',
            stdin: '',
            files: [
                { name: 'index.js', content: fullCode }
            ]
        })

        try {
            const response = await fetch('https://onecompiler-apis.p.rapidapi.com/api/v1/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-rapidapi-key': '7fe36901b4msh1b95d96225a7958p1295f4jsn4b2c9cc9a41f',
                    'x-rapidapi-host': 'onecompiler-apis.p.rapidapi.com'
                },
                body: data
            })

            const result = await response.json()
            if (result.stderr) {
                setError(result.stderr)
            } else {
                setOutput(result.stdout)
                if (result.stdout.includes('All tests passed successfully!')) {
                    setAllTestsPassed(true)
                    toast.success('Congratulations! All tests passed successfully!')
                } else {
                    const failedTests = result.stdout.split('\n').filter(line => line.includes('failed'))
                    if (failedTests.length > 0) {
                        setError(failedTests.join('\n'))
                        toast.error('Some tests failed. Check the output for details.')
                    }
                }
            }
        } catch (err) {
            setError('Network Error: ' + err.message)
        }
    }

    return (
        <div className='flex flex-col gap-4'>
            {allTestsPassed && <Confetti />}

            <Button onClick={executeTestSuite}>Run Code</Button>
            {output && (
                <div className="bg-gray-100 p-2 rounded dark:bg-gray-800">
                    <h5 className="text-lg font-semibold">Output:</h5>
                    <pre className="whitespace-pre-wrap">{output}</pre>
                </div>
            )}
            {error && (
                <div className="bg-red-100 p-2 rounded">
                    <h5 className="text-lg font-semibold text-red-600">Error:</h5>
                    <pre className="whitespace-pre-wrap text-red-600">{error}</pre>
                </div>
            )}
        </div>
    )
}
