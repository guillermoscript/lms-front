'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { addReview } from '@/actions/dashboard/studentActions'
import { useScopedI18n } from '@/app/locales/client'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { Tables } from '@/utils/supabase/supabase'

const FormSchema = z.object({
    rating: z.string().nonempty({ message: 'Please select a rating.' }),
    review: z
        .string()
        .min(10, { message: 'Review must be at least 10 characters.' })
        .max(460, {
            message: 'Review must not be longer than 460 characters.',
        }),
})

function ReviewForm({
    entityId,
    entityType,
}: {
    entityId: number
    entityType: Tables<'reviews'>['entity_type']
}) {
    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
    })

    const t = useScopedI18n('ReviewForm')

    async function onSubmit(data: z.infer<typeof FormSchema>) {
        try {
            const res = await addReview({
                stars: parseInt(data.rating),
                text: data.review,
                entityId,
                entityType,
            })

            if (res.error) {
                return toast({
                    title: t('toast.titleError'),
                    description: res.error || t('toast.messageError'),
                    variant: 'destructive',
                })
            }

            toast({
                title: t('toast.titleSuccess'),
                description: t('toast.messageSuccess'),
            })
        } catch (error) {
            console.error(error)
            toast({
                title: t('toast.titleError'),
                description: t('toast.messageError'),
                variant: 'destructive',
            })
        }
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
            >
                <FormField
                    control={form.control}
                    name="rating"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Rating</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select rating" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="5">
                                        5{' '}
                                        {t('stars', {
                                            count: 'other',
                                        })}
                                    </SelectItem>
                                    <SelectItem value="4">
                                        4{' '}
                                        {t('stars', {
                                            count: 'other',
                                        })}
                                    </SelectItem>
                                    <SelectItem value="3">
                                        3{' '}
                                        {t('stars', {
                                            count: 'other',
                                        })}
                                    </SelectItem>
                                    <SelectItem value="2">
                                        2{' '}
                                        {t('stars', {
                                            count: 'other',
                                        })}
                                    </SelectItem>
                                    <SelectItem value="1">
                                        1{' '}
                                        {t('star', {
                                            count: 1,
                                        })}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="review"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Review</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Write your review here..."
                                    className="resize-none"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                {t('reviewDescription')}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button disabled={form.formState.isSubmitting} type="submit">
                    {form.formState.isSubmitting ? (
                        <Loader className="animate-spin" size={20} />
                    ) : (
                        t('action')
                    )}
                </Button>
            </form>
        </Form>
    )
}

export default ReviewForm
