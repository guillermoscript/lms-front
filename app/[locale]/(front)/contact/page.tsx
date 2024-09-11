'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { useScopedI18n } from '@/app/locales/client'
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

const formSchema = z.object({
    name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
    email: z.string().email({ message: 'Invalid email address.' }),
    subject: z
        .string()
        .min(5, { message: 'Subject must be at least 5 characters.' }),
    message: z
        .string()
        .min(10, { message: 'Message must be at least 10 characters.' }),
})

type FormValues = z.infer<typeof formSchema>

const ContactForm = () => {
    const t = useScopedI18n('contact.form')

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
    })
    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = form
    const [isSubmitting, setIsSubmitting] = useState(false)
    const onSubmit = async (data: FormValues) => {
        setIsSubmitting(true)

        const contactFormId = process.env.NEXT_PUBLIC_CONTACT_FORM_ID!
        // Simulate API call
        const body = {
            'your-name': data.name,
            'your-email': data.email,
            'your-subject': data.subject,
            'your-message': data.message,
        }

        const url = `/contact-form-7/v1/contact-forms/${contactFormId}/feedback`

        // body should be in formdata format
        const formData = new FormData()
        Object.entries(body).forEach(([key, value]) => {
            formData.append(key, value)
        })
        formData.append('_wpcf7_unit_tag', contactFormId)

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
            })

            if (response.ok) {
                toast.success('Message sent successfully.')
                reset()
            } else {
                toast.error('Failed to send message.')
            }
        } catch (error) {
            toast.error('Failed to send message.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className=" w-full ">
            <section className="p-2">
                <Card>
                    <CardContent className="p-6">
                        <h2 className="text-2xl font-bold mb-6"></h2>
                        <Form {...form}>
                            <form
                                onSubmit={handleSubmit(onSubmit)}
                                className="space-y-4"
                            >
                                <FormField
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('name')}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...register('name')}
                                                    placeholder="John Doe"
                                                    className={
                                                        errors.name
                                                            ? 'border-red-500'
                                                            : ''
                                                    }
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('email')}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...register('email')}
                                                    type="email"
                                                    placeholder="example@example.com"
                                                    className={
                                                        errors.email
                                                            ? 'border-red-500'
                                                            : ''
                                                    }
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    name="subject"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('subject')}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...register('subject')}
                                                    placeholder={t('subject')}
                                                    className={
                                                        errors.subject
                                                            ? 'border-red-500'
                                                            : ''
                                                    }
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    name="message"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('message')}</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...register('message')}
                                                    placeholder={t('yourMessageHere')}
                                                    className={`min-h-[150px] ${errors.message
                                                        ? 'border-red-500'
                                                        : ''
                                                    }`}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? t('submitting') : t('submit')}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </section>
        </div>
    )
}

export default function ContactPage() {
    const t = useScopedI18n('contact')

    return (
        <div className="">
            <div className="container mx-auto px-4 py-12 space-y-8">
                <div className="text-center max-w-3xl mx-auto space-y-4">
                    <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
                    <p className="text-gray-400 mb-8">
                        {t('description')}
                    </p>
                    <p className="mt-3 mb-12 text-lg text-gray-600 dark:text-slate-400">
                        {t('description2')}
                    </p>
                </div>
                <div className="items-center">
                    <ContactForm />
                </div>
            </div>
        </div>
    )
}
