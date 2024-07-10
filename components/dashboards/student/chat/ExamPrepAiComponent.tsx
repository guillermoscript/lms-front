'use client'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { AI } from '@/actions/dashboard/ExamPreparationActions'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    Card, CardContent, CardDescription,
    CardFooter,
    CardHeader, CardTitle
} from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/utils'
import { FreeTextQuestion, MultipleChoiceQuestion as typeMultipleChoiceQuestion, SingleSelectQuestion as typeSingleSelectQuestion } from '@/utils/types'

import ChatLoadingSkeleton from './ChatLoadingSkeleton'

interface MatchingTextQuestion {
    id: string
    leftColumn: Array<{
        id: string
        text: string
    }>
    rightColumn: Array<{
        id: string
        text: string
        matchedWith: string
    }>
}

export default function ExamPrepAiComponent ({
    singleSelectQuestions,
    freeTextQuestions,
    multipleChoiceQuestions,
    matchingTextQuestions,
    hideSubmit
}: {
    singleSelectQuestions: typeSingleSelectQuestion[]
    freeTextQuestions: FreeTextQuestion[]
    multipleChoiceQuestions: typeMultipleChoiceQuestion[]
    matchingTextQuestions?: MatchingTextQuestion[]
    hideSubmit?: boolean
}) {
    const form = useForm()
    const isLoading = form.formState.isSubmitting
    const { continueConversation } = useActions()
    const [_, setMessages] = useUIState<typeof AI>()
    const [isFinished, setIsFinished] = useState<boolean>(hideSubmit || false)

    async function onSubmit (data: any) {
        const submission: Record<string, any> = {}

        console.log('data', data)

        // Single Select Questions
        singleSelectQuestions.forEach(question => {
            if (data[question.id]) {
                submission[question.id] = {
                    question: question.text,
                    type: 'Single Select',
                    answer: data[question.id]
                }
            }
        })

        // Free Text Questions
        freeTextQuestions.forEach(question => {
            if (data[question.id]) {
                submission[question.id] = {
                    question: question.label,
                    type: 'Free Text',
                    answer: data[question.id]
                }
            }
        })

        // Multiple Choice Questions
        multipleChoiceQuestions.forEach(question => {
            const selectedOptions = data[question.id] || []
            if (selectedOptions.length > 0) {
                submission[question.id] = {
                    question: question.label,
                    type: 'Multiple Choice',
                    answers: selectedOptions.map((optionId: string) => {
                        const option = question.options.find(opt => opt.id === optionId)
                        return option ? option.text : 'Unknown Option'
                    })
                }
            }
        })

        // Matching Text Questions
        matchingTextQuestions?.forEach(question => {
            const answers: Record<string, string> = {}
            const correctAnswers: Record<string, string> = {}
            question.leftColumn.forEach(leftItem => {
                const rightItem = question.rightColumn.find(item => item.id === data[leftItem.id])
                if (rightItem) {
                    answers[leftItem.text] = rightItem.text
                    correctAnswers[leftItem.text] = question.rightColumn.find(item => item.matchedWith === leftItem.id)?.text || ''
                }
            })
            submission[question.id] = {
                question: question.id,
                type: 'Matching Text',
                userAnswers: answers,
                correctAnswers
            }
        })

        console.log(submission)

        const content = `The student answered the following questions:

    ${Object.values(submission)
        .map((item) => {
            if (item.type === 'Matching Text') {
                return `
        Question Type: Matching Text
        Question ID: ${item.question}
        User Answers: ${JSON.stringify(item.userAnswers, null, 2)}
        Correct Answers: ${JSON.stringify(item.correctAnswers, null, 2)}
        `
            } else if (item.type === 'Multiple Choice') {
                return `
        Question Type: Multiple Choice
        Question: ${item.question}
        User Answers: ${JSON.stringify(item.answers, null, 2)}
        `
            } else {
                return `
        Question Type: ${item.type}
        Question: ${item.question}
        User Answer: ${item.answer}
        `
            }
        })
        .join('')}.
        This is the object of the user submission: ${JSON.stringify(submission, null, 2)}

        [showExamResult, please call the function \`showExamResult\` with the user submission object as the argument.]
        `

        console.log(content)

        try {
            const { display } = await continueConversation(content)

            setMessages((messages) => {
                console.log('messages', messages)
                return [...messages, {
                    id: generateId(),
                    display
                }]
            })
            setIsFinished(true)
            console.log(content)
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 my-4">
                    {singleSelectQuestions.length > 0 && singleSelectQuestions.map(question => {
                        return <TrueFalseQuestion key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {freeTextQuestions.length > 0 && freeTextQuestions.map(question => {
                        return <FreeTextQuestionComponent key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {multipleChoiceQuestions.length > 0 && multipleChoiceQuestions.map(question => {
                        return <MultipleChoiceQuestionComponent key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {matchingTextQuestions?.length > 0 && matchingTextQuestions.map(question => {
                        return <MatchingTextQuestionComponent key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {
                        !isFinished && (
                            <Button disabled={form.formState.isSubmitting} variant='secondary' type="submit">
                                {isLoading ? 'Submitting...' : 'Submit'}
                            </Button>
                        )
                    }

                    {isLoading && (
                        <ChatLoadingSkeleton />
                    )}
                </form>
            </Form>
        </>
    )
}

function TrueFalseQuestion ({ question, isFinished, form }: { question: typeSingleSelectQuestion, isFinished: boolean, form: any }) {
    return (
        <Card key={question.id}>
            <CardHeader>
                <CardTitle>True or False</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <>
                    <h4 className="text-sm font-semibold">{question.text}</h4>
                    <div className="flex items-center gap-2">
                        <input
                            disabled={isFinished}
                            type="radio" id={`${question.id}-true`} value="True" name={question.id} {...form.register(`${question.id}`)}
                        />
                        <label htmlFor={`${question.id}-true`}>True</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            disabled={isFinished}
                            type="radio" id={`${question.id}-false`} value="False" name={question.id} {...form.register(`${question.id}`)}
                        />
                        <label htmlFor={`${question.id}-false`}>False</label>
                    </div>
                </>
            </CardContent>
        </Card>
    )
}

function FreeTextQuestionComponent ({ question, isFinished, form }: { question: FreeTextQuestion, isFinished: boolean, form: any }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Free Text</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <Label htmlFor={question.id}>{question.label}</Label>
                <Textarea
                    disabled={isFinished}
                    id={question.id} {...form.register(question.id)}
                />
            </CardContent>
        </Card>
    )
}

function MultipleChoiceQuestionComponent ({ question, isFinished, form }: { question: typeMultipleChoiceQuestion, isFinished: boolean, form: any }) {
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

interface ColumnItem {
    id: string
    text: string
}

function MatchingTextQuestionComponent ({ question, isFinished, form }: { question: MatchingTextQuestion, isFinished: boolean, form: any }) {
    const [selectedLeft, setSelectedLeft] = useState<ColumnItem | null>(null)
    const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({})
    const [reverseMatchedPairs, setReverseMatchedPairs] = useState<Record<string, string>>({})

    const handleLeftClick = (leftItem: ColumnItem): void => {
        if (selectedLeft?.id === leftItem.id) {
            setSelectedLeft(null)
        } else {
            setSelectedLeft(leftItem)
        }
    }

    const handleRightClick = (rightItem: ColumnItem): void => {
        if (selectedLeft) {
            const newPairs = { ...matchedPairs, [selectedLeft.id]: rightItem.id }
            const newReversePairs = { ...reverseMatchedPairs, [rightItem.id]: selectedLeft.id }
            setMatchedPairs(newPairs)
            setReverseMatchedPairs(newReversePairs)
            setSelectedLeft(null)
            form.setValue(selectedLeft.id, rightItem.id)
        }
    }

    const handleDeselect = (leftId: string): void => {
        const rightId = matchedPairs[leftId]
        const newPairs = { ...matchedPairs }
        const newReversePairs = { ...reverseMatchedPairs }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete newPairs[leftId]
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete newReversePairs[rightId]
        setMatchedPairs(newPairs)
        setReverseMatchedPairs(newReversePairs)
        form.setValue(leftId, '')
    }

    const getBackgroundColor = (item: ColumnItem, column: 'left' | 'right'): string => {
        if (column === 'left' && selectedLeft && selectedLeft.id === item.id) {
            return buttonVariants({ variant: 'default' })
        }
        if (column === 'left' && matchedPairs[item.id]) {
            return buttonVariants({ variant: 'secondary' })
        }
        if (column === 'right' && reverseMatchedPairs[item.id]) {
            return buttonVariants({ variant: 'secondary' })
        }
        if (column === 'right' && selectedLeft && reverseMatchedPairs[item.id]) {
            return buttonVariants({ variant: 'default' })
        }
        return buttonVariants({ variant: 'outline' })
    }

    const isItemDisabled = (item: ColumnItem, column: 'left' | 'right'): boolean => {
        if (column === 'right' && reverseMatchedPairs[item.id]) {
            return true
        }
        if (column === 'left' && matchedPairs[item.id]) {
            return true
        }
        return false
    }

    const isMatched = (leftId: string, rightId: string): boolean => matchedPairs[leftId] === rightId

    return (
        <Card>
            <CardHeader>
                <CardTitle>Matching Text Question</CardTitle>
                <CardDescription>Match the items in the left column with the items in the right column by clicking on the items.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-8">
                    <div className="flex flex-col gap-4">
                        {question.leftColumn.map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    isItemDisabled(item, 'left') ? ' opacity-50 cursor-not-allowed' : 'cursor-pointer',
                                    getBackgroundColor(item, 'left'),
                                    'flex gap-4 items-center justify-between py-4 h-12'
                                )}
                                onClick={() => {
                                    if (isFinished) return
                                    !isItemDisabled(item, 'left') && handleLeftClick(item)
                                }}
                            >
                                <span>{item.text}</span>
                                {matchedPairs[item.id] && (
                                    <Button
                                        variant='destructive'
                                        onClick={() => handleDeselect(item.id)}
                                        disabled={isFinished}
                                    >
                    Cancel
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-4">
                        {question.rightColumn.map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    isItemDisabled(item, 'right') ? ' opacity-50 cursor-not-allowed' : 'cursor-pointer',
                                    getBackgroundColor(item, 'right'),
                                    'flex gap-4 items-center justify-between py-4 h-12'
                                )}
                                onClick={() => !isItemDisabled(item, 'right') && handleRightClick(item)}
                            >
                                <span>{item.text}</span>
                                {Object.keys(matchedPairs).map((leftId) => (
                                    isMatched(leftId, item.id) && (
                                        <span key={item.id} className="ml-2 text-lg">{' (Matched)'}</span>
                                    )
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter>

                {selectedLeft && (
                    <div className="text-center mt-4 text-gray-700">
                        <p>Selected: {selectedLeft.text}</p>
                    </div>
                )}
            </CardFooter>
        </Card>
    )
}
