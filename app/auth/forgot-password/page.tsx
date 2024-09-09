'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { forgotPasswordFun } from '@/actions/auth/authActions'
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
import { useToast } from '@/components/ui/use-toast'

const FormSchema = z.object({
    email: z.string().email({ message: 'Invalid email address' }),
})

export default function ForgotPassword({
    searchParams,
}: {
    searchParams: {
        message: string;
        error: string;
    };
}) {
    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            email: '',
        },
    })

    const { toast } = useToast()

    const submit = async (data: z.infer<typeof FormSchema>) => {
        const res = await forgotPasswordFun({
            email: data.email,
        })

        if (res.status === 'error') {
            return toast({
                title: 'Error',
                description: res.message,
                variant: 'destructive',
            })
        }

        return toast({
            title: 'Success',
            description: res.message,
        })
    }

    return (
        <>
            <div className="lg:p-8">
                <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                    <div className="flex flex-col space-y-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">
              Forgot Password
                        </h1>
                        <p className="text-sm text-muted-foreground">
              Enter your email below to reset your password
                        </p>
                    </div>
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(submit)}
                            className="animate-in flex-1 flex flex-col w-full justify-center gap-8 text-foreground"
                        >
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="you@example.com"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit">Submit</Button>
                        </form>
                    </Form>

                    <Link
                        href="/auth/login"
                        className="text-center text-sm cursor-pointer text-primary"
                    >
            Back to login
                    </Link>
                </div>
            </div>
        </>
    )
}
