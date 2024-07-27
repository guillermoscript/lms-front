'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { KnowMeChatAI } from '@/actions/dashboard/AI/KnowMeActions'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'

const LearningPreferencesSchema = z.object({
    favoriteLearningExperience: z.object({
        description: z
            .string()
            .min(5, {
                message: 'Description must be at least 5 characters long.',
            }),
        effectiveAspects: z
            .string()
            .min(5, {
                message:
                    'Effective aspects must be at least 5 characters long.',
            }),
    }),
    learningChallenge: z.object({
        description: z
            .string()
            .min(5, {
                message: 'Description must be at least 5 characters long.',
            }),
        strategies: z
            .string()
            .min(5, {
                message: 'Strategies must be at least 5 characters long.',
            }),
    }),
    preferTheoryOrPractice: z.object({
        preference: z.enum(['theory', 'practical examples']),
        reason: z
            .string()
            .min(5, { message: 'Reason must be at least 5 characters long.' }),
    }),
    frustratingActivity: z.object({
        description: z
            .string()
            .min(5, {
                message: 'Description must be at least 5 characters long.',
            }),
        frustrationReason: z
            .string()
            .min(5, {
                message:
                    'Frustration reason must be at least 5 characters long.',
            }),
    }),
    importanceOfFeedback: z.object({
        scale: z.string().regex(/^\d$/, {
            message: 'Scale must be a number between 1 and 5.',
        }),
        example: z
            .string()
            .min(5, { message: 'Example must be at least 5 characters long.' }),
    }),
})

type LearningPreferencesFormData = z.infer<typeof LearningPreferencesSchema>

export function LearningPreferencesForm({
    hideSubmit,
}: {
    hideSubmit?: boolean
}) {
    const form = useForm<LearningPreferencesFormData>({
        resolver: zodResolver(LearningPreferencesSchema),
        defaultValues: {
            favoriteLearningExperience: {
                description: '',
                effectiveAspects: '',
            },
            learningChallenge: {
                description: '',
                strategies: '',
            },
            preferTheoryOrPractice: {
                preference: 'theory',
                reason: '',
            },
            frustratingActivity: {
                description: '',
                frustrationReason: '',
            },
            importanceOfFeedback: {
                scale: '3',
                example: '',
            },
        },
    })

    const { continueKnowMeChatConversation } = useActions()
    const [_, setMessages] = useUIState<typeof KnowMeChatAI>()
    const [isFinished, setIsFinished] = useState<boolean>(hideSubmit || false)

    async function onSubmit(data: LearningPreferencesFormData) {
        const content = `The student answered the following questions:
        1. Favorite Learning Experience: ${data.favoriteLearningExperience.description}
        2. Effective Aspects: ${data.favoriteLearningExperience.effectiveAspects}
        3. Learning Challenge Description: ${data.learningChallenge.description}
        4. Strategies: ${data.learningChallenge.strategies}
        5. Prefer Theory or Practice: ${data.preferTheoryOrPractice.preference}
        6. Reason: ${data.preferTheoryOrPractice.reason}
        7. Frustrating Activity Description: ${data.frustratingActivity.description}
        8. Frustration Reason: ${data.frustratingActivity.frustrationReason}
        9. Importance of Feedback: ${data.importanceOfFeedback.scale}
        10. Example: ${data.importanceOfFeedback.example}
        
        [responseForUserInitialMessage] please call the function to continue the conversation with the student.`

        const supabase = createClient()

        try {
            const { display } = await continueKnowMeChatConversation(content)

            setMessages((messages) => {
                return [...messages, {
                    id: generateId(),
                    display
                }]
            })

            const userData = await supabase.auth.getUser()

            const updateProfile = await supabase
                .from('profiles')
                .update({
                    data_person: data,
                })
                .eq('id', userData?.data.user.id)

            console.log(updateProfile)

            setIsFinished(true)
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="w-2/3 space-y-6"
            >
                {/* Favorite Learning Experience */}
                <FormField
                    control={form.control}
                    name="favoriteLearningExperience.description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Yoyr Favorite Learning Experience
                            </FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Describe your favorite learning experience"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Briefly describe your favorite learning
                                experience.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="favoriteLearningExperience.effectiveAspects"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Effective Aspects</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="What made it effective?"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Describe what made this learning experience
                                effective for you.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {/* Learning Challenge */}
                <FormField
                    control={form.control}
                    name="learningChallenge.description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Learning Challenge Description
                            </FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Describe a learning challenge you face"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Briefly describe a learning challenge you often
                                face.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="learningChallenge.strategies"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Strategies</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="What strategies have you tried?"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Describe the strategies you have tried to
                                overcome this challenge.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {/* Prefer Theory or Practice */}
                <FormField
                    control={form.control}
                    name="preferTheoryOrPractice.preference"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Prefer Theory or Practice</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a verified email to display" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="theory">Theory</SelectItem>
                                    <SelectItem value="practical examples">Practical Examples</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormDescription> Do you prefer starting with theory or practical examples?
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="preferTheoryOrPractice.reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Reason</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Why does this approach work better for you?"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Explain why this approach works better for you.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {/* Frustrating Activity */}
                <FormField
                    control={form.control}
                    name="frustratingActivity.description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Frustrating Activity Description
                            </FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Describe a frustrating learning activity"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Describe a recent learning activity that felt
                                frustrating.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="frustratingActivity.frustrationReason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Frustration Reason</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Why was it frustrating?"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Explain what specifically made it frustrating.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {/* Importance of Feedback */}
                <FormField
                    control={form.control}
                    name="importanceOfFeedback.scale"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Importance of Feedback (1-5)</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    min={1}
                                    max={5}
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                On a scale of 1-5, how important is immediate
                                feedback to you?
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="importanceOfFeedback.example"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Example</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Describe an example where feedback impacted your learning"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Can you give an example of when immediate
                                feedback significantly impacted your learning?
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {!isFinished && (
                    <Button
                        disabled={form.formState.isSubmitting}
                        type="submit"
                    >
                        {form.formState.isSubmitting ? 'Submitting...' : 'Submit'}
                    </Button>
                )}
            </form>
        </Form>
    )
}
