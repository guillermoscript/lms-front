'use client'
import axios, { isAxiosError } from 'axios'
import { Loader } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { useScopedI18n } from '@/app/locales/client'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import {
    FreeTextQuestion as FTQType,
    MultipleChoiceQuestion as MCQType,
    SingleSelectQuestion as SSQType,
    StudentExamSubmitFormData,
} from '@/utils/types'

import FreeTextQuestionForm from '../teacher/test/FreeTextQuestion'
import MultipleChoiceQuestion from '../teacher/test/MultipleChoiceQuestion'
import SingleSelectQuestion from '../teacher/test/SingleSelectQuestion'

interface ExamsSubmissionFormProps {
    multipleChoiceQuestions: MCQType[]
    freeTextQuestions: FTQType[]
    singleSelectQuestions: SSQType[]
    examId: number
    courseId: number
}

export default function ExamsSubmissionForm({
    multipleChoiceQuestions,
    freeTextQuestions,
    singleSelectQuestions,
    examId,
    courseId,
}: ExamsSubmissionFormProps) {
    const form = useForm<StudentExamSubmitFormData>({
        defaultValues: generateDefaultValues(
            multipleChoiceQuestions,
            freeTextQuestions,
            singleSelectQuestions
        ),
    })

    const [open, setOpen] = useState(false)
    const [openWarning, setOpenWarning] = useState(false) // New state to control warning modal
    const router = useRouter()
    const { toast } = useToast()

    async function onSubmit(data: any) {
        console.log(data, 'submitting exam')
        const payload = parseFormData(data, {
            singleSelectQuestions,
            multipleChoiceQuestions,
            freeTextQuestions,
        })

        if (payload.hasIncomplete && !openWarning) {
            setOpenWarning(true) // New state to control warning modal
            return
        }

        console.log(payload)

        try {
            const res = await axios.post('/api/exams/submit', {
                examId,
                answers: payload.parsedData,
                detailedAnswers: payload.data,
            })

            toast({
                title: 'Success',
                description: 'Exam submitted successfully',
            })

            router.push(
                `/dashboard/student/courses/${courseId}/exams/${examId}/review`
            )
        } catch (e) {
            console.log(e)
            if (isAxiosError(e)) {
                toast({
                    title: 'Error',
                    description: e.response?.data.error || e.message,
                    variant: 'destructive',
                })
            }
        }

        setOpen(false)
    }

    const t = useScopedI18n('ExamsSubmissionForm')

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-6"
            >
                <>
                    {singleSelectQuestions.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold">
                                {t('trueOrFalse')}
                            </h3>

                            <SingleSelectQuestion
                                questions={singleSelectQuestions}
                                control={form.control}
                            />
                        </div>
                    )}

                    <Separator className="my-4" />

                    {freeTextQuestions.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold">
                                {t('freeText')}
                            </h3>

                            <FreeTextQuestionForm
                                questions={freeTextQuestions}
                                control={form.control}
                            />
                        </div>
                    )}

                    <Separator className="my-4" />

                    {multipleChoiceQuestions.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold">
                                {t('multipleChoice')}
                            </h3>

                            <MultipleChoiceQuestion
                                questions={multipleChoiceQuestions}
                                form={form}
                            />
                        </div>
                    )}
                </>

                <AlertDialog open={open} onOpenChange={setOpen}>
                    <AlertDialogTrigger asChild>
                        <Button
                            disabled={form.formState.isSubmitting}
                            type="button"
                        >
                            {t('submit')}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {openWarning
                                    ? t('alert.warningTitle')
                                    : t('alert.title')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {openWarning
                                    ? t('alert.warningDescription')
                                    : t('alert.description')}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel
                                disabled={form.formState.isSubmitting}
                                onClick={() => {
                                    setOpen(false)
                                    setOpenWarning(false)
                                }}
                            >
                                {t('cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                                disabled={form.formState.isSubmitting}
                                onClick={(e) => {
                                    e.preventDefault()
                                    form.handleSubmit(onSubmit)()
                                }}
                            >
                                {form.formState.isSubmitting ? (
                                    <Loader
                                        className="animate-spin"
                                        size={20}
                                    />
                                ) : (
                                    t('submit')
                                )}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </form>
        </Form>
    )
}

function parseFormData(
    data: StudentExamSubmitFormData,
    questions: {
        singleSelectQuestions: Array<{ id: string; text: string }>
        multipleChoiceQuestions: Array<{
            id: string
            label: string
            options: Array<{ id: string; text: string }>
        }>
        freeTextQuestions: Array<{ id: string; label: string }>
    }
) {
    const parsedData: Array<{
        question_id: string
        answer_text: string
        question_type: string
    }> = []
    const detailedData: Array<{
        question_type: string
        question_text: string
        user_answer: string | string[]
        options?: Array<{ id: string; text: string }>
    }> = []
    const allQuestions = [
        ...questions.singleSelectQuestions,
        ...questions.multipleChoiceQuestions,
        ...questions.freeTextQuestions,
    ]

    const getQuestionText = (id: string, optionId = '') => {
        const question = allQuestions.find((q) => q.id === id)
        if (question) {
            if ('options' in question && optionId) {
                // @ts-expect-error
                const option = question.options?.find(
                    (opt) => opt.id === optionId
                )
                return option ? option.text : id
            }
            // @ts-expect-error
            return question.text || question.label
        }
        return id
    }

    const getQuestionOptions = (id: string) => {
        const question = allQuestions.find((q) => q.id === id)
        if (question && 'options' in question) {
            return question.options
        }
        return []
    }

    const processedQuestionIds = new Set<string>()
    let hasIncomplete = false // Flag to track incomplete data

    Object.keys(data).forEach((key) => {
        const questionId = key.includes('-') ? key.split('-')[0] : key

        if (processedQuestionIds.has(questionId)) {
            return
        }

        if (Array.isArray(data[key])) {
            // Handle multiple choice questions

            if (data[key].length === 0) {
                hasIncomplete = true
            }
            const options = getQuestionOptions(key)
            const userAnswers = data[key]?.map((optionId) =>
                getQuestionText(key, optionId)
            )
            detailedData.push({
                question_type: 'multiple_choice',
                question_text: getQuestionText(key),
                user_answer: userAnswers,
                // @ts-expect-error
                options,
            })
            data[key]?.forEach((optionId) => {
                if (optionId !== undefined) {
                    parsedData.push({
                        question_id: key,
                        answer_text: optionId,
                        question_type: 'multiple_choice',
                    })
                }
            })
        } else {
            // Handle free text or potential true/false questions
            if (!data[key]) {
                hasIncomplete = true
            }
            const questionText = getQuestionText(key)
            parsedData.push({
                question_id: key,
                answer_text: data[key] as string,
                question_type: 'free_text',
            })
            detailedData.push({
                question_type: 'free_text',
                question_text: questionText,
                user_answer: data[key] as string,
                options: [],
            })
        }

        processedQuestionIds.add(questionId)
    })

    // Secondary check to correct mis-categorized true/false questions
    detailedData.forEach((entry, index) => {
        if (
            entry.question_type === 'free_text' &&
            typeof entry.user_answer === 'string' &&
            (entry.user_answer.endsWith('-true') ||
                entry.user_answer.endsWith('-false'))
        ) {
            const [questionId, answerPart] = entry.user_answer.split('-')
            const answerText = (answerPart.charAt(0).toUpperCase() +
                answerPart.slice(1)) as 'True' | 'False'
            detailedData[index] = {
                question_type: 'true_false',
                question_text: getQuestionText(questionId),
                user_answer: answerText,
                options: [
                    { id: `${questionId}-true`, text: 'True' },
                    { id: `${questionId}-false`, text: 'False' },
                ],
            }

            // Update parsedData accordingly
            const parsedIndex = parsedData.findIndex(
                (p) => p.question_id === questionId
            )
            if (parsedIndex !== -1) {
                parsedData[parsedIndex] = {
                    question_id: questionId,
                    answer_text: answerText,
                    question_type: 'true_false',
                }
            }
        }
    })

    const filteredParsedData = parsedData.filter(
        (question) => question.answer_text && question.answer_text !== ''
    )

    return {
        parsedData: filteredParsedData,
        data: detailedData,
        hasIncomplete, // Return the flag
    }
}

function generateDefaultValues(mcq: MCQType[], ftq: FTQType[], ssq: SSQType[]) {
    const defaults: StudentExamSubmitFormData = {}
    mcq.forEach((question) => {
        defaults[question.id] = []
    })
    ftq.forEach((question) => {
        defaults[question.id] = ''
    })
    ssq.forEach((question) => {
        defaults[question.id + '-true'] = false
        defaults[question.id + '-false'] = false
    })
    return defaults
}
