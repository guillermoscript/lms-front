'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import axios from 'axios'
import { Loader } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import { useScopedI18n } from '@/app/locales/client'

import { Button } from '../ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '../ui/card'
import { useToast } from '../ui/use-toast'
import { Input, Select } from './Form'
import FormBuilder from './FormBuilder'

const classNames = {
    label: 'text-xs font-medium text-neutral-600',
    input: 'input input-bordered w-full',
    error: 'pt-2 text-red-400',
    container: 'mb-4 flex flex-col gap-4'
}

const questionsSchema = yup.array().of(
    yup.object().shape({
        type: yup.string().required('Type is required'),
        label: yup.string().required('Label is required'),
        options: yup.array().of(
            yup.object().shape({
                label: yup.string(),
                value: yup.string(),
                correct: yup.boolean()
            })
        ),
        required: yup.boolean().required('Required is required'),
        value: yup.string()
    })
)

const validationSchema = yup.object().shape({
    testName: yup.string().required('Test Name is required'),
    testDescription: yup.string().required('Test Description is required'),
    exam_date: yup.string().required('Exam Date is required'),
    duration: yup.number().required('Time for Test is required'),
    questions: questionsSchema,
    status: yup.string().required('Status is required'),
    sequence: yup.number().required('Sequence is required'),
    formFields: questionsSchema
})

type TestFormType = yup.InferType<typeof validationSchema>

interface TestFormProps {
    defaultValues?: Partial<TestFormType>
    testId?: string // Optional: if provided, it's an edit form
    courseId: string
}

const TeacherTestForm: React.FC<TestFormProps> = ({
    defaultValues = {},
    testId,
    courseId
}) => {
    const isEditing = !!testId

    const initialValues: TestFormType = {
    // testName: "",
        testName: '',
        testDescription: '',
        exam_date: '',
        duration: 0,
        status: 'draft',
        questions: [],
        sequence: 0,
        ...defaultValues
    }

    const formMethods = useForm<TestFormType>({
        resolver: yupResolver(validationSchema),
        defaultValues: initialValues
    })

    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const router = useRouter()

    const handleSubmit = async (data: TestFormType) => {
        setIsLoading(true)

        const url = '/api/test/'
        const method = testId ? 'put' : 'post'
        const updateField = (data as any)?.formFields?.map((field: any) => {
            if (field?.type === 'true_false') {
                return {
                    ...field,
                    options: [{
                        label: field.label,
                        value: field?.value,
                        correct: field?.value
                    }]
                }
            }
            return field
        })

        const finalData = {
            ...data,
            formFields: updateField,
            course: courseId,
            ...(
                testId &&
					{ exam_id: Number(testId) }
            )
        }

        // if test id is provided, it's an edit form, add the test id to the data
        try {
            const response = await axios[method](url, finalData)
            const message = testId ? 'Test Updated' : 'Test Created'
            toast({ title: message, description: response.data.message })
            router.push('/dashboard/teacher/courses/')
        } catch (error) {
            console.error('Error submitting the form', error)
            toast({
                title: 'Error',
                description: 'Failed to submit the form',
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    const t = useScopedI18n('TeacherTestForm')

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">
                {testId ? (
                    t('edit')
                )
                    : t('create')}
            </h1>
            <FormProvider {...formMethods}>
                <form
                    onSubmit={formMethods.handleSubmit(handleSubmit)}
                    className="space-y-4"
                >
                    <Input
                        name="testName"
                        displayName={t('form.testName')}
                        type="text"
                        clasess={classNames}
                    />
                    <Input
                        name="testDescription"
                        displayName={t('form.testDescription')}
                        type="text"
                        clasess={classNames}
                    />
                    <Input
                        name="sequence"
                        displayName={t('form.sequence')}
                        type="number"
                        clasess={classNames}
                    />
                    <Input
                        name="exam_date"
                        displayName={t('form.examDate')}
                        type="date"
                        clasess={classNames}
                    />
                    <Input
                        name="duration"
                        displayName={t('form.duration')}
                        type="number"
                        clasess={classNames}
                    />
                    <Select
                        name="status"
                        displayName={t('form.status')}
                        options={[
						  { value: 'draft', label: t('form.statusOptions.draft') },
						  { value: 'published', label: t('form.statusOptions.published') },
						  { value: 'archived', label: t('form.statusOptions.archived') }
                        ]}
                        clasess={classNames}
                    />
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {t('card.title')}
                            </CardTitle>
                            <CardDescription>
                                {t('card.description')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FormBuilder
                                initialFields={defaultValues.questions}
                            >
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading ? (
                                        <Loader className="h-6 w-6 animate-spin" />
                                    ) : isEditing ? (
                                        t('form.update')
                                    ) : (
                                        t('form.create')
                                    )}
                                </Button>
                            </FormBuilder>
                        </CardContent>
                    </Card>
                </form>
            </FormProvider>
        </div>
    )
}

export default TeacherTestForm
