'use client'
import axios, { isAxiosError } from 'axios'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

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
    StudentExamSubmitFormData
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

export default function ExamsSubmissionForm ({
    multipleChoiceQuestions,
    freeTextQuestions,
    singleSelectQuestions,
    examId,
    courseId
}: ExamsSubmissionFormProps) {
    const form = useForm<StudentExamSubmitFormData>({
        defaultValues: generateDefaultValues(
            multipleChoiceQuestions,
            freeTextQuestions,
            singleSelectQuestions
        )
    })

    const [open, setOpen] = useState(false)

    const router = useRouter()
    const { toast } = useToast()

    async function onSubmit (data: any) {
        const payload = parseFormData(data)

        try {
            const res = await axios.post('/api/exams/submit', {
                examId,
                answers: payload
            })

            console.log(res.data)

            toast({
                title: 'Success',
                description: 'Exam submitted successfully'
            })

            router.push(`/dashboard/student/courses/${courseId}/exams/${examId}/review`)
        } catch (e) {
            console.log(e)
            if (isAxiosError(e)) {
                toast({
                    title: 'Error',
                    description: e.response?.data.error || e.message,
                    variant: 'destructive'
                })
            }
        }

        setOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            setOpen(true)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleKeyDown} className="grid gap-6">
                <>
                    {singleSelectQuestions.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold">
              True or False
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
              Fill in the Blank
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
              Multiple Choice
                            </h3>

                            <MultipleChoiceQuestion
                                questions={multipleChoiceQuestions}
                                form={form}
                            />
                        </div>
                    )}
                </>

                <AlertDialog
                    open={open} onOpenChange={setOpen}
                >
                    <AlertDialogTrigger asChild>
                        <Button
                            disabled={form.formState.isSubmitting}
                            type='button'
                        >
            Submit Exam
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
        Once you submit, you can't go back and change your answers.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel
                                disabled={form.formState.isSubmitting}
                            >Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                disabled={form.formState.isSubmitting}
                                onClick={(e) => {
                                    e.preventDefault()
                                    form.handleSubmit(onSubmit)()
                                }}
                            >
                                {form.formState.isSubmitting ? 'Submitting...' : 'Submit'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

            </form>
        </Form>
    )
}

function parseFormData (data: StudentExamSubmitFormData) {
    const parsedData: Array<{ question_id: string, answer_text: string, question_type: string }> = []

    Object.keys(data).forEach((key) => {
        if (key.includes('-true') || key.includes('-false')) {
            if (data[key] === true) {
                parsedData.push({
                    question_id: key.split('-')[0],
                    answer_text: key.includes('true') ? 'true' : 'false',
                    question_type: 'true_false'
                })
            }
        } else if (Array.isArray(data[key])) {
            data[key]?.forEach((optionId) => {
                if (optionId !== undefined) {
                    parsedData.push({
                        question_id: key,
                        answer_text: optionId,
                        question_type: 'multiple_choice'
                    })
                }
            })
        } else {
            parsedData.push({
                question_id: key,
                answer_text: data[key] as string,
                question_type: 'free_text'
            })
        }
    })

    return parsedData.filter(
        (question) => question.answer_text && question.answer_text !== ''
    )
}

function generateDefaultValues (
    mcq: MCQType[],
    ftq: FTQType[],
    ssq: SSQType[]
) {
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
