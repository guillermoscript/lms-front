'use client'

import axios, { isAxiosError } from 'axios'
import cx from 'classnames'
import { CheckCircleIcon, CircleIcon, Loader, XCircleIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'

import CorrectnessRadio from './CorrectnessRadio'

interface Answer {
    answer_id: number
    is_correct: boolean
    feedback: string
    question_id: number
    answer_text: string
    option_id: number
}

export default function TestSubmissionReview({
    exam_answers,
    exams,
    submissionId,
    studentId
}: {
    exam_answers: Answer[]
    exams: any
    submissionId: number
    studentId: number
}) {
    const [answers, setAnswers] = useState(exam_answers)
    const [feedback, setfeedback] = useState({
        overall_feedback: ''
    })

    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()
    const router = useRouter()
    const t = useScopedI18n('TestSubmissionReview')

    const handleFeedbackChange = (answerId: number, feedback: string) => {
        setAnswers((prevAnswers) =>
            prevAnswers.map((answer) =>
                answer.answer_id === answerId ? { ...answer, feedback } : answer
            )
        )
    }

    const handleCorrectnessChange = (answerId: number, isCorrect: boolean) => {
        setAnswers((prevAnswers) =>
            prevAnswers.map((answer) =>
                answer.answer_id === answerId
                    ? { ...answer, is_correct: isCorrect }
                    : answer
            )
        )
    }

    const handleSubmit = async () => {
        setIsLoading(true)
        const finalData = {
            answers,
            ...feedback,
            score: answers.reduce((acc, answer) => acc + (answer.is_correct ? 1 : 0), 0),
            submission_id: submissionId,
            student_id: studentId,
            exam_id: exams.exam_id
        }

        try {
            const response = await axios.post('/api/exams/review', finalData)
            console.log(response.data)
            toast({
                title: 'Success',
                description: 'Feedback submitted successfully'
            })
            router.push(`/dashboard/teacher/courses/${exams.course_id}/tests/${exams.exam_id}`)
        } catch (error) {
            console.log(error)
            if (isAxiosError(error)) {
                toast({
                    title: 'Error',
                    description: error.response?.data.error || error.message,
                    variant: 'destructive'
                })
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            {exams.exam_questions.map((question) => {
                const answer = answers.find(
                    (a) => a.question_id === question.question_id
                )

                return (
                    <div
                        key={question.question_id}
                        className="bg-white rounded-lg shadow-md p-6 dark:bg-gray-950"
                    >
                        <h2 className="text-2xl font-bold mb-4">
                            {question.question_text}
                        </h2>

                        <div className="mt-2">
                            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t('studentAnswer')}
                            </Label>

                            {question.question_type === 'multiple_choice' ? (
                                <div className="mb-4 p-2 rounded flex flex-col gap-2">
                                    {question.question_options.map((option) => {
                                        const userAnwsers = answers.filter(
                                            (a) =>
                                                a.question_id ===
                                                question.question_id
                                        )

                                        const userAnswer = userAnwsers.find(
                                            (a) =>
                                                a.answer_text
                                                    .split(',')
                                                    .includes(
                                                        option.option_id.toString()
                                                    )
                                        )

                                        const isChecked = userAnwsers.some(
                                            (a) =>
                                                a.answer_text
                                                    .split(',')
                                                    .includes(
                                                        option.option_id.toString()
                                                    )
                                        )

                                        const isCorrect = option.is_correct

                                        const backgroundColor = isChecked
                                            ? isCorrect
                                                ? 'bg-green-100 dark:bg-green-800'
                                                : 'bg-red-100 dark:bg-red-800'
                                            : 'bg-gray-100 dark:bg-gray-800'

                                        return (
                                            <div
                                                key={option.option_id}
                                                className={cx(
                                                    'flex items-center gap-2 p-2 rounded',
                                                    backgroundColor
                                                )}
                                            >
                                                {isChecked ? (
                                                    isCorrect ? (
                                                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                                    ) : (
                                                        <XCircleIcon className="h-5 w-5 text-red-500" />
                                                    )
                                                ) : (
                                                    <CircleIcon className="h-5 w-5 text-gray-500" />
                                                )}

                                                <span>
                                                    {option.option_text}
                                                </span>
                                                {isChecked && (
                                                    <CorrectnessRadio
                                                        answer={userAnswer}
                                                        onChange={
                                                            handleCorrectnessChange
                                                        }
                                                    />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <p className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                                    {answer?.answer_text}
                                </p>
                            )}
                        </div>

                        <div className="mt-4">
                            <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t('feedback')}
                            </Label>

                            <Textarea
                                className="mt-2 min-h-[120px]"
                                value={answer?.feedback || ''}
                                onChange={(e) =>
                                    handleFeedbackChange(
                                        answer.answer_id,
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                        {question.question_type !== 'multiple_choice' && (
                            <div className="mt-4">
                                <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t('correct')}
                                </Label>

                                <CorrectnessRadio
                                    answer={answer}
                                    onChange={handleCorrectnessChange}
                                />
                            </div>
                        )}
                    </div>
                )
            })}

            <div>
                <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('score')}
                </Label>

                <span className="text-2xl font-bold">
                    {answers.reduce(
                        (acc, answer) => acc + (answer.is_correct ? 1 : 0),
                        0
                    )}
                    /{answers.length}
                </span>
            </div>

            <div>
                <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('overallFeedback')}
                </Label>

                <Textarea
                    className="mt-2 min-h-[120px]"
                    value={feedback.overall_feedback || ''}
                    onChange={(e) =>
                        setfeedback((prevfeedback) => ({
                            ...prevfeedback,
                            overall_feedback: e.target.value,
                        }))
                    }
                />
            </div>

            <div className="flex gap-2">
                <Button disabled={isLoading} onClick={handleSubmit}>
                    {isLoading ? (
                        <Loader className="h-6 w-6 animate-spin" />
                    ) : (
                        t('submit')
                    )}
                </Button>
            </div>
        </>
    )
}
