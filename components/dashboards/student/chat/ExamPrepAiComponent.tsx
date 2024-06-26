'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ExamPrepAnwser } from '@/actions/dashboard/ExamPreparationActions'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
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
    const [feedback, setFeedback] = useState<Array<{ question: string, feedback: string }>>([])

    async function onSubmit (data: any) {
        const submission: Record<string, any> = {}

        // Single Select Questions
        singleSelectQuestions.forEach(question => {
            const answerTrue = data[`${question.id}-true`]
            const answerFalse = data[`${question.id}-false`]
            if (answerTrue || answerFalse) {
                submission[question.id] = {
                    question: question.text,
                    answer: answerTrue ? 'True' : 'False'
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
                            answers: []
                        }
                    }
                    submission[question.id].answers.push(option.text)
                }
            })
        })

        try {
            const response = await ExamPrepAnwser(submission)

            setFeedback(response.questionAndAnswerFeedback)
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
                    {singleSelectQuestions.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-semibold">True or False</h3>

                            {singleSelectQuestions.map(question => (
                                <div className='flex flex-col gap-2' key={question.id}>
                                    <h4 className="text-sm font-semibold">{question.text}</h4>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            id={`${question.id}-true`}
                                            value={`${question.id}-true`}
                                            name={question.id}
                                            {...form.register(`${question.id}-true`)}
                                        />
                                        <label htmlFor={`${question.id}-true`}>True</label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            id={`${question.id}-false`}
                                            value={`${question.id}-false`}
                                            name={question.id}
                                            {...form.register(`${question.id}-false`)}
                                        />
                                        <label htmlFor={`${question.id}-false`}>False</label>
                                    </div>

                                    {feedback.find(f => f.question === question.text) && (
                                        <div className="text-sm text-red-500 mt-2">
                                            {feedback.find(f => f.question === question.text)?.feedback}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <Separator className="my-4" />

                    {freeTextQuestions.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-semibold">Fill in the Blank</h3>

                            {freeTextQuestions.map(question => (
                                <div className="flex flex-col gap-2" key={question.id}>
                                    <label htmlFor={question.id}>{question.label}</label>
                                    <input type="text" id={question.id} {...form.register(question.id)} />

                                    {feedback.find(f => f.question === question.label) && (
                                        <div className="text-sm text-red-500 mt-2">
                                            {feedback.find(f => f.question === question.label)?.feedback}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <Separator className="my-4" />

                    {multipleChoiceQuestions.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-semibold">Multiple Choice</h3>

                            {multipleChoiceQuestions.map(question => (
                                <div className="flex flex-col gap-2" key={question.id}>
                                    <h4 className="text-sm font-semibold">{question.label}</h4>

                                    {question.options.map(option => (
                                        <div className="flex items-center gap-2" key={option.id}>
                                            <input
                                                type="checkbox"
                                                id={option.id}
                                                value={option.id}
                                                {...form.register(option.id)}
                                            />
                                            <label htmlFor={option.id}>{option.text}</label>
                                        </div>
                                    ))}

                                    {feedback.find(f => f.question === question.label) && (
                                        <div className="text-sm text-red-500 mt-2">
                                            {feedback.find(f => f.question === question.label)?.feedback}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <Button disabled={form.formState.isSubmitting} variant='secondary' type="submit">Submit</Button>
                </form>
            </Form>
        </>
    )
}
