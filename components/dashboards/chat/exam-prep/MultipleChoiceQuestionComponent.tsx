'use client'
import { CheckCircleIcon, CircleIcon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { MultipleChoiceQuestion as typeMultipleChoiceQuestion } from '@/utils/types'

export default function MultipleChoiceQuestionComponent ({ question, isFinished, form }: { question: typeMultipleChoiceQuestion, isFinished: boolean, form: any }) {
    const [selectedOptions, setSelectedOptions] = useState<string[]>([])

    const handleOptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const optionValue = event.target.value
        setSelectedOptions(prevSelectedOptions => {
            if (prevSelectedOptions.includes(optionValue)) {
                const newSelections = prevSelectedOptions.filter(option => option !== optionValue)
                form.setValue(question.id, newSelections)
                return newSelections
            } else {
                const newSelections = [...prevSelectedOptions, optionValue]
                form.setValue(question.id, newSelections)
                return newSelections
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{question.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {question.options.map(option => (
                    <div key={option.id} className="flex items-center gap-2">
                        <input
                            disabled={isFinished}
                            type="checkbox"
                            id={`${question.id}-${option.id}`}
                            value={option.id}
                            name={question.id}
                            checked={selectedOptions.includes(option.id)}
                            onChange={handleOptionChange}
                        />
                        <label htmlFor={`${question.id}-${option.id}`}>{option.text}</label>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

export interface MultipleChoiceQuestionInterface {
    id: string
    question: string
    options: Array<{
        id: string
        text: string
        correct: boolean
        userSelected: boolean
    }>
    feedback: string
}

export const QuizFeedback = ({ questions }: {
    questions: MultipleChoiceQuestionInterface[]
}) => {
    return questions.map((question) => (
        <Card key={question.id}>
            <CardHeader>
                <CardTitle>{question.question}</CardTitle>
                <CardDescription>Multiple Choice Question</CardDescription>
            </CardHeader>
            <CardContent>
                <div>
                    {question.options.map((option) => {
                        const userSelected = option.userSelected
                        const isCorrect = option.correct

                        let backgroundColor = 'bg-gray-100 dark:bg-gray-800'
                        if (userSelected) {
                            backgroundColor = isCorrect
                                ? 'bg-green-100 dark:bg-green-800'
                                : 'bg-red-100 dark:bg-red-800'
                        } else if (isCorrect) {
                            backgroundColor = 'bg-green-50 dark:bg-green-700'
                        }

                        return (
                            <div
                                key={option.id}
                                className={`flex items-center gap-2 p-2 rounded mb-2 ${backgroundColor}`}
                            >
                                {userSelected ? (
                                    isCorrect ? (
                                        <>
                                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                            <span>{option.text} (You selected the correct answer)</span>
                                        </>
                                    ) : (
                                        <>
                                            <XCircleIcon className="h-5 w-5 text-red-500" />
                                            <span>{option.text} (You selected this incorrect answer)</span>
                                        </>
                                    )
                                ) : (
                                    isCorrect ? (
                                        <>
                                            <CheckCircleIcon className="h-5 w-5 text-green-300" />
                                            <span>{option.text} (Correct answer, but you did not select it)</span>
                                        </>
                                    ) : (
                                        <>
                                            <CircleIcon className="h-5 w-5 text-gray-500" />
                                            <span>{option.text} (Incorrect answer)</span>
                                        </>
                                    )
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>
            <CardFooter>
                <div className="text-center mt-4">
                    <p>{question.feedback}</p>
                </div>
            </CardFooter>
        </Card>
    ))
}
