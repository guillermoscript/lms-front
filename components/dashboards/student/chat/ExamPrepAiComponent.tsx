'use client'
import { Check, CheckCircle, XCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ExamPrepAnwser } from '@/actions/dashboard/ExamPreparationActions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
    const [feedback, setFeedback] = useState<Array<{ question: string, feedback: string }>>([])
    const [score, setScore] = useState<number>(0)
    const [overallFeedback, setOverallFeedback] = useState<string>('')
    const isLoading = form.formState.isSubmitting

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
            console.log(submission)
            const response = await ExamPrepAnwser(submission)
            console.log(response)

            setFeedback(response?.questionAndAnswerFeedback)
            setScore(response.grade)
            setOverallFeedback(response.overallFeedback)
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <>
            <Form {...form}>
                {score > 0 && (
                    <Alert
                        className='my-4'
                        variant={score >= 10 && score <= 15 ? 'warning' : score < 10 ? 'destructive' : 'success'}
                    >
                        {
                            score >= 10 && score <= 15 ? (
                                <Check className='w-6 h-6 text-yellow-500' />
                            ) : score < 10 ? (
                                <XCircleIcon className='w-6 h-6 text-destructive' />
                            ) : (
                                <CheckCircle className='w-6 h-6 text-green-500' />
                            )
                        }
                        <AlertTitle>
                            Your score is {score}
                        </AlertTitle>
                        <AlertDescription>
                            This is based on a scale of 0 to 20 and is calculated based on the correctness of your answers.
                            You can review your answers below.
                        </AlertDescription>
                    </Alert>
                )}
                {overallFeedback.length > 0 && (
                    <Card className='my-4'>
                        <CardHeader>
                            <CardTitle>Overall Feedback</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {overallFeedback}
                        </CardContent>
                    </Card>
                )}
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
                    {singleSelectQuestions.length > 0 && singleSelectQuestions.map(question => (
                        <Card key={question.id}>
                            <CardHeader>
                                <CardTitle>True or False</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">

                                {isLoading ? (
                                    <>
                                        <Skeleton className="h-4 w-1/4" />
                                        <Skeleton className="h-4 w-1/4" />
                                    </>
                                ) : (
                                    <>
                                        <h4 className="text-sm font-semibold">{question.text}</h4>
                                        <div className="flex items-center gap-2">
                                            <input
                                                disabled={feedback.length > 0}
                                                type="radio" id={`${question.id}-true`} value="True" name={question.id} {...form.register(`${question.id}`)}
                                            />
                                            <label htmlFor={`${question.id}-true`}>True</label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                disabled={feedback.length > 0}
                                                type="radio" id={`${question.id}-false`} value="False" name={question.id} {...form.register(`${question.id}`)}
                                            />
                                            <label htmlFor={`${question.id}-false`}>False</label>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                            {feedback.length > 0 && (
                                <CardFooter className="flex flex-col gap-4 items-start">
                                    <CardTitle>Feedback</CardTitle>
                                    <CardDescription>
                                        {feedback.find(f => f.question === question.text)?.feedback}
                                    </CardDescription>
                                </CardFooter>
                            )}
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
                                {
                                    isLoading ? (
                                        <>
                                            <Skeleton className="h-6 w-1/2 " />
                                            <Skeleton className="h-6 w-2/3" />
                                            <Skeleton className="h-6 w-1/3" />
                                        </>
                                    ) : (
                                        <>
                                            <Label htmlFor={question.id}>{question.label}</Label>
                                            <Textarea
                                                disabled={feedback.length > 0}

                                                id={question.id} {...form.register(question.id)}
                                            />
                                        </>
                                    )
                                }
                            </CardContent>
                            {feedback.length > 0 && (
                                <CardFooter
                                    className="flex flex-col gap-4 items-start"
                                >
                                    <CardTitle>Feedback</CardTitle>
                                    <CardDescription>
                                        {feedback.find(f => f.question === question.label)?.feedback}
                                    </CardDescription>
                                </CardFooter>
                            )}
                        </Card>
                    ))}

                    {multipleChoiceQuestions.length > 0 && multipleChoiceQuestions.map(question => (
                        <Card key={question.id}>
                            <CardHeader>
                                <CardTitle>Multiple Choice</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-2">
                                <h4 className="text-sm font-semibold">{question.label}</h4>
                                {isLoading ? (
                                    question.options.map(option => (
                                        <Skeleton key={option.id} className="h-4 w-1/3" />
                                    ))
                                ) : (
                                    question.options.map(option => (
                                        <div className="flex items-center gap-2" key={option.id}>
                                            <input
                                                disabled={feedback.length > 0}
                                                type="checkbox" id={option.id} value={option.id} {...form.register(option.id)}
                                            />
                                            <label htmlFor={option.id}>{option.text}</label>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                            {feedback.length > 0 && (
                                <CardFooter className="flex flex-col gap-4 items-start">
                                    <CardTitle>Feedback</CardTitle>
                                    <CardDescription>
                                        {feedback.find(f => f.question === question.label)?.feedback}
                                    </CardDescription>
                                </CardFooter>
                            )}
                        </Card>
                    ))}

                    {
                        feedback.length === 0 && (
                            <Button disabled={form.formState.isSubmitting} variant='secondary' type="submit">Submit</Button>
                        )
                    }
                </form>
            </Form>
        </>
    )
}
