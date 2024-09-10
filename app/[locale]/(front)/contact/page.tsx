'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
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
                                            <FormLabel>Name</FormLabel>
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
                                            <FormLabel>Email</FormLabel>
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
                                            <FormLabel>Subject</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...register('subject')}
                                                    placeholder="Subject"
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
                                            <FormLabel>Message</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...register('message')}
                                                    placeholder="Your message here..."
                                                    className={`min-h-[150px] ${
                                                        errors.message
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
                                    {isSubmitting ? 'Submitting...' : 'Submit'}
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
    return (
        <div className="">
            <div className="container mx-auto px-4 py-12 space-y-8">
                <div className="text-center max-w-3xl mx-auto space-y-4">
                    <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
                    <p className="text-gray-400 mb-8">
                        Please reach out to us and we will get back to you at
                        the speed of light.
                    </p>
                </div>
                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <ContactForm />
                    <div className="h-full pr-6 p-2 flex flex-col ">
                        <p className="mt-3 mb-12 text-lg text-gray-600 dark:text-slate-400">
                            Class aptent taciti sociosqu ad litora torquent per
                            conubia nostra, per inceptos himenaeos. Duis nec
                            ipsum orci. Ut scelerisque sagittis ante, ac
                            tincidunt sem venenatis ut.
                        </p>
                        <ul className="mb-6 md:mb-0">
                            <li className="flex">
                                <MapPin className="w-6 h-6" />
                                <div className="ml-4 mb-4">
                                    <h3 className="mb-2 text-lg font-medium leading-6">
                                        Our Address
                                    </h3>
                                    <p>1230 Maecenas Street Donec Road</p>
                                    <p>New York, EEUU</p>
                                </div>
                            </li>
                            <li className="flex">
                                <Phone className="w-6 h-6" />
                                <div className="ml-4 mb-4">
                                    <h3 className="mb-2 text-lg font-medium leading-6">
                                        Contact
                                    </h3>
                                    <a
                                        href='mailto:rxh41sejl@mozmail.com'
                                    >rxh41sejl@mozmail.com</a>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
