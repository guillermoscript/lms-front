'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createSupportTicket } from '@/actions/contact'
import { useToast } from '../ui/use-toast'

const formSchema = z.object({
    title: z.string().min(1, { message: 'Title is required.' }),
    description: z.string().min(1, { message: 'Description is required.' }),
    issues: z.array(z.string()).nonempty({ message: 'At least one issue must be selected.' }),
})

export default function SupportTicket() {
    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: '',
            description: '',
            issues: [],
        },
    })

    const { toast } = useToast()

    const onSubmit = async (data) => {
        console.log(data)

        const submit = await createSupportTicket(data)

        if (submit.status === 'success') {
            form.reset()
            toast({
                title: 'Success',
                description: submit.message,
            })
        } else {
            toast({
                title: 'Error',
                description: submit.message,
                variant: 'destructive'
            })
        }
    }

    return (
        <div className="w-full max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="space-y-4">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Submit a Support Ticket
                    </h1>
                    <p className="mt-3 max-w-2xl mx-auto text-muted-foreground sm:text-lg">
            Having trouble with our product? Fill out the form below to report an issue and we'll get back to you as
            soon as possible.
                    </p>
                </div>
                <Card>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem className="sm:col-span-6">
                                                <FormLabel htmlFor="title">Title</FormLabel>
                                                <FormControl>
                                                    <Input id="title" placeholder="Briefly describe the issue" required {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="issues"
                                        render={({ field }) => (
                                            <FormItem className="space-y-2 sm:col-span-6">
                                                <FormLabel>Provide additional feedback on this issue. Select all that apply.</FormLabel>
                                                <FormControl>
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                        {[
                                                            'Bugs',
                                                            'Price Devolution',
                                                            'Lesson Content Issues',
                                                            'Exam Too Hard',
                                                            'AI Not Responding',
                                                            'Enrollment Problems',
                                                            'Course Progress Not Saving',
                                                            'Video/Audio Issues',
                                                            'Assignment Submission Issues',
                                                            'Other'
                                                        ].map((issue) => (
                                                            <Button
                                                                key={issue}
                                                                variant={field.value.includes(issue) ? 'default' : 'outline'}
                                                                type='button'
                                                                onClick={() => {
                                                                    if (field.value.includes(issue)) {
                                                                        field.onChange(field.value.filter(item => item !== issue))
                                                                    } else {
                                                                        field.onChange([...field.value, issue])
                                                                    }
                                                                }}
                                                            >
                                                                {issue}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem className="sm:col-span-6">
                                                <FormLabel htmlFor="description">Description</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        id="description"
                                                        placeholder="Provide more details about the problem you're experiencing"
                                                        rows={5}
                                                        required
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        disabled={form.formState.isSubmitting}
                                        type="submit" className="w-full sm:w-auto">
                    {form.formState.isSubmitting ? 'Submitting...' : 'Submit Ticket'}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
