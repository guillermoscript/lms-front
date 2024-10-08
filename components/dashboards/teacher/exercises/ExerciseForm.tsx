'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

// Form schema validation setup
const FormSchema = z.object({
    title: z.string().min(1, { message: 'Title is required' }),
    description: z.string().optional(),
    instructions: z.string().min(1, { message: 'Instructions are required' }),
    systemPrompt: z.string().min(1, { message: 'System Prompt is required' }),
    exerciseType: z.enum([
        'quiz',
        'coding_challenge',
        'essay',
        'multiple_choice',
        'true_false',
        'fill_in_the_blank',
        'discussion',
    ]),
    difficultyLevel: z.enum(['easy', 'medium', 'hard']),
    timeLimit: z.string().optional(),
})

export function ExerciseForm({ params, initialValues }: {
    params: { lessonId?: string, exerciseId?: string; courseId: string }
    initialValues?: Partial<z.infer<typeof FormSchema>>
}) {
    const isEditing = Boolean(params?.exerciseId)

    const form = useForm({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            title: initialValues?.title || '',
            description: initialValues?.description,
            instructions: initialValues?.instructions || '',
            systemPrompt: initialValues?.systemPrompt,
            exerciseType: initialValues?.exerciseType || 'quiz',
            difficultyLevel: initialValues?.difficultyLevel || 'easy',
            timeLimit: initialValues?.timeLimit || undefined,
        },
    })

    const onSubmit = async (data) => {
        // Call your submit action here, either create or edit based on `isEditing`
        const method = isEditing ? 'PUT' : 'POST'
        data.timeLimit = +(data.timeLimit)
        data.course_id = +params.courseId
        params.lessonId && (data.lesson_id = +params.lessonId)
        params.exerciseId && (data.exerciseId = +params.exerciseId)
        try {
            const response = await axios({
                method,
                url: '/api/exercises',
                data,
            })

            console.log(response)

            toast.success('Exercise created successfully')
        } catch (error) {
            console.error(error)
            toast.error('Failed to create exercise')
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <h1 className="text-2xl font-semibold">
                    {isEditing ? 'Edit' : 'Create'} Exercise
                </h1>

                <FormField
                    name="title"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="Title of the exercise"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="description"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="Optional description"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="instructions"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Instructions</FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    rows={4}
                                    placeholder="Detailed instructions"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="systemPrompt"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>System Prompt</FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    rows={3}
                                    placeholder="Optional system prompt"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="exerciseType"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Exercise Type</FormLabel>
                            <FormControl>
                                <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="quiz">
                                            Quiz
                                        </SelectItem>
                                        <SelectItem value="coding_challenge">
                                            Coding Challenge
                                        </SelectItem>
                                        <SelectItem value="essay">
                                            Essay
                                        </SelectItem>
                                        <SelectItem value="multiple_choice">
                                            Multiple Choice
                                        </SelectItem>
                                        <SelectItem value="true_false">
                                            True/False
                                        </SelectItem>
                                        <SelectItem value="fill_in_the_blank">
                                            Fill in the Blank
                                        </SelectItem>
                                        <SelectItem value="discussion">
                                            Discussion
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="difficultyLevel"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Difficulty Level</FormLabel>
                            <FormControl>
                                <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select difficulty" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="easy">
                                            Easy
                                        </SelectItem>
                                        <SelectItem value="medium">
                                            Medium
                                        </SelectItem>
                                        <SelectItem value="hard">
                                            Hard
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    name="timeLimit"
                    control={form.control}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Time Limit (mins)</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    {...field}
                                    placeholder="Optional time limit"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {
                    // Hidden field to send the exerciseId if editing
                    isEditing && (
                        <input
                            type="hidden"
                            name="exerciseId"
                            value={params.exerciseId}
                        />
                    )
                }
                {
                    // Hidden field to send the lessonId if creating
                    params?.lessonId && (
                        <input
                            type="hidden"
                            name="lessonId"
                            value={params.lessonId}
                        />
                    )
                }

                <Button
                    disabled={form.formState.isSubmitting}
                    type="submit"
                >
                    {
                        form.formState.isSubmitting
                            ? 'Submitting...'
                            : isEditing
                                ? 'Update Exercise'
                                : 'Create Exercise'
                    }
                </Button>
            </form>
        </Form>
    )
}

export default ExerciseForm
