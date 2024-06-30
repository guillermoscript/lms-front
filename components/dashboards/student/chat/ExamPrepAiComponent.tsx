'use client'
import { useActions, useUIState } from 'ai/rsc'
import { ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { FreeTextQuestion, MultipleChoiceQuestion as typeMultipleChoiceQuestion, SingleSelectQuestion as typeSingleSelectQuestion } from '@/utils/types'

export default function ExamPrepAiComponent ({
    singleSelectQuestions,
    freeTextQuestions,
    multipleChoiceQuestions
}: {
    singleSelectQuestions: typeSingleSelectQuestion[]
    freeTextQuestions: FreeTextQuestion[]
    multipleChoiceQuestions: typeMultipleChoiceQuestion[]
}) {
    const form = useForm()
    const isLoading = form.formState.isSubmitting
    const { continueConversation } = useActions()
    const [_, setMessages] = useUIState()
    const [isFinished, setIsFinished] = useState<boolean>(false)

    async function onSubmit (data: any) {
        const submission: Record<string, any> = {}

        // Single Select Questions
        singleSelectQuestions.forEach(question => {
            if (data[question.id]) {
                submission[question.id] = {
                    question: question.text,
                    answer: data[question.id]
                }
            }
        })

        // Free Text Questions
        freeTextQuestions.forEach(question => {
            if (data[question.id]) {
                submission[question.id] = {
                    question: question.label,
                    answer: data[question.id]
                }
            }
        })

        // Multiple Choice Questions
        multipleChoiceQuestions.forEach(question => {
            question.options.forEach(option => {
                if (data[option.id]) {
                    if (!submission[question.id]) {
                        submission[question.id] = {
                            question: question.label,
                            answers: [],
                            questionOptions: question.options.map(o => o.text)
                        }
                    }
                    submission[question.id].answers.push(option.text)
                }
            })
        })

        try {
            const content = `The student anwsered the following questions: ${Object.values(
                submission
            )
                .map((item) => item.question)
                .join(', ')}
                ${Object.values(submission)
        .map((item) => {
            if (Array.isArray(item.answers)) {
                return (
                    'Answer: ' +
                        item.answers.join(', ') +
                        ` Options: ${item.questionOptions.join(', ')}`
                )
            } else {
                return `Answer: ${item.answer}`
            }
        })
        .join(', ')}`

            const { display } = await continueConversation(content)

            setMessages((messages: ReactNode[]) => {
                console.log('messages', messages)
                return [...messages, {
                    role: 'user',
                    display
                }]
            })
            setIsFinished(true)
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
                    {singleSelectQuestions.length > 0 && singleSelectQuestions.map(question => (
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
                    ))}

                    {freeTextQuestions.length > 0 && freeTextQuestions.map(question => (
                        <Card key={question.id}>
                            <CardHeader>
                                <CardTitle>Fill in the Blank</CardTitle>
                            </CardHeader>
                            <CardContent
                                className="flex flex-col gap-4"
                            >
                                <Label htmlFor={question.id}>{question.label}</Label>
                                <Textarea
                                    disabled={isFinished}

                                    id={question.id} {...form.register(question.id)}
                                />

                            </CardContent>
                        </Card>
                    ))}

                    {multipleChoiceQuestions.length > 0 && multipleChoiceQuestions.map(question => (
                        <Card key={question.id}>
                            <CardHeader>
                                <CardTitle>Multiple Choice</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-2">
                                <h4 className="text-sm font-semibold">{question.label}</h4>
                                {question.options.map(option => (
                                    <div className="flex items-center gap-2" key={option.id}>
                                        <input
                                            disabled={isFinished}
                                            type="checkbox" id={option.id} value={option.id} {...form.register(option.id)}
                                        />
                                        <label htmlFor={option.id}>{option.text}</label>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ))}

                    {
                        !isFinished && (
                            <Button disabled={form.formState.isSubmitting} variant='secondary' type="submit">Submit</Button>
                        )
                    }

                    {isLoading && (
                        <div className="space-y-2 w-full">
                            <Skeleton className="h-6 rounded mr-14" />
                            <div className="grid grid-cols-3 gap-4">
                                <Skeleton className="h-6 rounded col-span-2" />
                                <Skeleton className="h-6 rounded col-span-1" />
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                                <Skeleton className="h-6 rounded col-span-1" />
                                <Skeleton className="h-6 rounded col-span-2" />
                                <Skeleton className="h-6 rounded col-span-1 mr-4" />
                            </div>
                            <Skeleton className="h-6 rounded" />
                        </div>
                    )}
                </form>
            </Form>
        </>
    )
}
