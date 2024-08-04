'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import { Suspense } from 'react'
import { useFormState } from 'react-dom'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import {
    createLessonsAction,
    editLessonsAction
} from '@/actions/dashboard/lessonsAction'
import { Input, Select } from '@/components/form/Form'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import { Separator } from '@/components/ui/separator'

import ButtonSubmitDashbaord from '../../ButtonSubmitDashbaord'
import StateMessages from '../../StateMessages'

const selectClassNames = {
    container: '  flex flex-col form-control gap-3 relative',
    label: 'text-sm  font-medium text-neutral-600',
    input:
    'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
    error: 'pt-2 text-destructive absolute top-full left-0 text-xs'
}

// Schema for form validation
const lessonSchema = yup.object({
    title: yup.string().required('Title is required'),
    sequence: yup.number().required('Sequence is required').positive().integer(),
    video_url: yup.string().url().nullable(),
    embed: yup.string().nullable(),
    content: yup.string().required('Content is required'),
    status: yup.string().oneOf(['draft', 'published', 'archived']).required(),
    systemPrompt: yup.string().required('System Prompt is required'),
    description: yup.string(),
    image: yup.string().nullable().url(),
    task_instructions: yup.string().nullable()
})

export type LessonSchemaType = yup.InferType<typeof lessonSchema>

interface LessonFormProps {
    params: { courseId: string, lessonId?: string }
    initialValues?: Partial<LessonSchemaType>
}

const LessonForm: React.FC<LessonFormProps> = ({ params, initialValues }) => {
    const { courseId, lessonId } = params
    const isEditing = !!lessonId
    const [state, action] = useFormState(
        isEditing ? editLessonsAction : createLessonsAction,
        {
            status: 'idle',
            message: '',
            error: null
        }
    )
    const defaultValues: LessonSchemaType = {
        title: '',
        sequence: 0,
        video_url: '',
        embed: '',
        description: '',
        content: '',
        image: '',
        status: 'draft',
        task_instructions: '',
        ...(initialValues || {
            title: '',
            sequence: 0,
            video_url: '',
            embed: '',
            content: '',
            status: 'draft',
            image: '',
            systemPrompt: '',
            description: '',
            task_instructions: ''
        })
    }

    const formMethods = useForm<LessonSchemaType>({
        resolver: yupResolver(lessonSchema),
        defaultValues
    })

    const contentWatch = formMethods.watch('content')
    const systemPromptWatch = formMethods.watch('systemPrompt')
    const taskInstructionsWatch = formMethods.watch('task_instructions')

    return (
        <FormProvider {...formMethods}>
            <form action={action} className="space-y-4">
                <h1 className="text-2xl font-semibold">
                    {isEditing ? 'Edit' : 'Create'} Lesson
                </h1>
                <Input type="text" name="title" displayName="Title" />

                <Input type="text" name="description" displayName="Description" />
                <Input name="sequence" displayName="Sequence" type="number" />
                <Input type="text" name="video_url" displayName="YouTube Video URL" />
                <Input type="text" name="embed" displayName="Embed Code" />
                <Input type="text" name="image" displayName="Image URL" />
                <Select
                    name="status"
                    displayName="Status"
                    options={[
                        { value: 'draft', label: 'Draft' },
                        { value: 'published', label: 'Published' },
                        { value: 'archived', label: 'Archived' }
                    ]}
                    clasess={selectClassNames}
                />

                <Card>
                    <CardHeader>
                        <CardTitle>Content of lessons</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={
                            <div>Loading...</div>
                        }
                        >
                            <ForwardRefEditor
                                markdown={contentWatch}
                                className="markdown-body"
                                onChange={(value) => {
                                    console.log(value)
                                    formMethods.setValue('content', value)
                                }}
                                onError={(error) => {
                                    console.log('Error in editor content', error)
                                }}
                            />
                            <input type="hidden" name="content" value={contentWatch} />
                        </Suspense>
                    </CardContent>
                </Card>

                <Separator />

                <Card>
                    <CardHeader>
                        <CardTitle>System Prompt</CardTitle>
                        <CardDescription>
              This is the prompt that the AI will use to generate responses.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={
                            <div>Loading...</div>
                        }
                        >
                            <ForwardRefEditor
                                markdown={systemPromptWatch}
                                className="markdown-body"
                                onChange={(value) => formMethods.setValue('systemPrompt', value)}
                                onError={(error) => {
                                    console.log('Error in editor system prompt', error)
                                }}
                            />
                            <input
                                type="hidden"
                                name="systemPrompt"
                                value={systemPromptWatch}
                            />
                        </Suspense>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>
                            Task Instructions
                        </CardTitle>
                        <CardDescription>
                            The assignment instructions for the AI task.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={
                            <div>Loading...</div>
                        }
                        >
                            <ForwardRefEditor
                                markdown={taskInstructionsWatch}
                                className="markdown-body"
                                onChange={(value) => formMethods.setValue('task_instructions', value)}
                                onError={(error) => {
                                    console.log('Error in editor system prompt', error)
                                }}
                            />
                            <input
                                type="hidden"
                                name="task_instructions"
                                value={taskInstructionsWatch}
                            />
                        </Suspense>
                    </CardContent>
                </Card>

                <input type="hidden" name="course_id" value={courseId} />
                <input type="hidden" name="lessonId" value={lessonId} />
                <ButtonSubmitDashbaord />
                <StateMessages state={state} />
            </form>
        </FormProvider>
    )
}

export default LessonForm
