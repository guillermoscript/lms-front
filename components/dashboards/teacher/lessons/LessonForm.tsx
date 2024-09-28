'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import { useFormState } from 'react-dom'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import {
    createLessonsAction,
    editLessonsAction
} from '@/actions/dashboard/lessonsAction'
import { useScopedI18n } from '@/app/locales/client'
import { Input, Select } from '@/components/form/Form'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

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
        title: initialValues?.title || '',
        sequence: initialValues?.sequence || 0,
        video_url: initialValues?.video_url || '',
        embed: initialValues?.embed || '',
        description: initialValues?.description || '',
        content: initialValues?.content || '',
        image: initialValues?.image || '',
        status: initialValues?.status || 'draft',
        task_instructions: initialValues?.task_instructions || '',
    }

    const formMethods = useForm<LessonSchemaType>({
        resolver: yupResolver(lessonSchema),
        ...(
            isEditing && { defaultValues }
        )
    })

    // const contentWatch = formMethods.watch('content')
    // const systemPromptWatch = formMethods.watch('systemPrompt')
    // const taskInstructionsWatch = formMethods.watch('task_instructions')
    const t = useScopedI18n('LessonForm')

    return (
        <FormProvider {...formMethods}>
            <form action={action} className="space-y-4 container">
                <h1 className="text-2xl font-semibold">
                    {isEditing ? 'Edit' : 'Create'} {t('title')}
                </h1>
                <Input type="text" name="title" displayName={t('form.title')} />

                <Input type="text" name="description" displayName={t('form.description')} />
                <Input name="sequence" displayName="Sequence" type={t('form.sequence')} />
                <Input type="text" name="video_url" displayName={t('form.videoUrl')} />
                <Input type="text" name="embed" displayName={t('form.embed')} />
                <Input type="text" name="image" displayName={t('form.image')} />
                <Select
                    name="status"
                    displayName={t('form.status')}
                    options={[
                        { value: 'draft', label: t('form.statusOptions.draft') },
                        { value: 'published', label: t('form.statusOptions.published') },
                        { value: 'archived', label: t('form.statusOptions.archived') }
                    ]}
                    clasess={selectClassNames}
                />

                <Card>
                    <CardHeader>
                        <CardTitle>
                            {t('cardTitle')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            name="content"
                            placeholder="Content of the lesson"
                            rows={15}
                            defaultValue={initialValues?.content}
                        />
                    </CardContent>
                </Card>

                <Separator />

                <Card>
                    <CardHeader>
                        <CardTitle>
                            {t('systemPromptTitle')}
                        </CardTitle>
                        <CardDescription>
                            {t('systemPromptDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            name="systemPrompt"
                            placeholder={t('form.systemPrompt')}
                            rows={15}
                            defaultValue={initialValues?.systemPrompt}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>
                            {t('taskInsturctionsTitle')}
                        </CardTitle>
                        <CardDescription>
                            {t('taskInstructionsDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            name="task_instructions"
                            placeholder={t('form.taskInstructions')}
                            rows={15}
                            defaultValue={initialValues?.task_instructions}
                        />
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
