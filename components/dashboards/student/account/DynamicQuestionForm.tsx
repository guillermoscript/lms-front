'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { KnowMeChatAI, QuestionToFulfill } from '@/actions/dashboard/AI/KnowMeActions'
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
import { toast } from '@/components/ui/use-toast'

// Define the props for the DynamicForm component
interface DynamicFormProps {
    questions: QuestionToFulfill;
    // onSubmit: (data: Record<string, any>) => void;
    hideSubmit?: boolean;
}

// Define the component
export default function DynamicQuestionForm({ questions, hideSubmit }: DynamicFormProps) {
    // Create a zod schema dynamically
    const schema = z.object(
        questions.reduce<Record<string, any>>((acc, question) => {
            acc[question.name] = question.type === 'number'
                ? z.string().regex(/^\d+$/, { message: `${question.label} must be a number.` })
                : z.string().min(1, { message: `${question.label} is required.` })
            return acc
        }, {})
    )

    // Initialize the form
    const form = useForm<Record<string, any>>({
        resolver: zodResolver(schema),
        defaultValues: questions.reduce<Record<string, any>>((acc, question) => {
            acc[question.name] = question.type === 'number' ? 3 : ''
            return acc
        }, {}),
    })
    const { continueKnowMeChatConversation } = useActions()
    const [_, setMessages] = useUIState<typeof KnowMeChatAI>()
    const [isFinished, setIsFinished] = useState<boolean>(hideSubmit || false)

    async function handleSubmit(data: Record<string, any>) {
        try {
            const { display } = await continueKnowMeChatConversation(`The student has completed the orm. Here is a JSON representation of the form data: ${JSON.stringify(data)} [responseForUserInput] please call the function 'responseForUserInput' to get the AI response.`)

            setMessages((messages) => {
                console.log('messages', messages)
                return [...messages, {
                    id: generateId(),
                    display
                }]
            })
            setIsFinished(true)
            console.log(data)
        } catch (error) {
            console.error(error)
        }

        toast({
            title: 'You submitted the following values:',
            description: (
                <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
                    <code className="text-white">{JSON.stringify(data, null, 2)}</code>
                </pre>
            ),
        })
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="w-2/3 space-y-6">
                {questions.map((question, index) => (
                    <FormField
                        key={index}
                        control={form.control}
                        name={question.name}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{question.label}</FormLabel>
                                <FormControl>
                                    {question.type === 'select' ? (
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={question.placeholder} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {question.options?.map((option, index) => (
                                                    <SelectItem key={index} value={option}>
                                                        {option}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input
                                            placeholder={question.placeholder}
                                            type={question.type === 'number' ? 'number' : 'text'}
                                            {...field}
                                        />
                                    )}
                                </FormControl>
                                {question.description && (
                                    <FormDescription>{question.description}</FormDescription>
                                )}
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ))}
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
