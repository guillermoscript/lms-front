'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { resetPasswordFun } from '@/actions/auth/authActions'
import { useI18n } from '@/app/locales/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
    password: z
        .string()
        .min(8, { message: 'Password must be at least 8 characters.' })
        .max(100, {
            message: 'Password must be at most 100 characters.',
        }),
})

export default function ResetPassword({
    searchParams,
}: {
    searchParams: {
        message: string
        error: string
        code: string
    }
}) {
    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            password: '',
        },
    })

    const t = useI18n()

    const [showPassword, setShowPassword] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    const submit = async (data: z.infer<typeof FormSchema>) => {
        try {
            const res = await resetPasswordFun({
                password: data.password,
                code: searchParams.code,
            })

            if (res.error) {
                return toast({
                    title: 'Error',
                    description: res.error,
                    variant: 'destructive',
                })
            }

            router.push('/')

            return toast({
                title: 'Success',
                description: res.message,
            })
        } catch (error: any) {
            return toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            })
        }
    }

    return (
        <>
            <div className="lg:p-8">
                <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                    <div className="flex flex-col space-y-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {t('auth.resetPassword.header')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('auth.resetPassword.description')}
                        </p>
                    </div>
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(submit)}
                            className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground"
                        >
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t(
                                                'auth.resetPassword.newPassword'
                                            )}
                                        </FormLabel>
                                        <FormControl>
                                            <div className="rounded-md px-4 py-2 w-full bg-inherit border mb-6 gap-4 flex items-center justify-between">
                                                <Input
                                                    className="border-none w-full bg-transparent focus:outline-none"
                                                    type={
                                                        showPassword
                                                            ? 'text'
                                                            : 'password'
                                                    }
                                                    {...field}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowPassword(
                                                            !showPassword
                                                        )
                                                    }
                                                >
                                                    {!showPassword ? (
                                                        <EyeIcon />
                                                    ) : (
                                                        <EyeOffIcon />
                                                    )}
                                                </button>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button
                                disabled={form.formState.isSubmitting}
                                type="submit"
                            >
                                {form.formState.isSubmitting
                                    ? t('auth.resetPassword.loading')
                                    : t('auth.resetPassword.button')}
                            </Button>
                        </form>
                    </Form>
                    {searchParams.error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error!</AlertTitle>
                            <AlertDescription>
                                {searchParams.error}
                            </AlertDescription>
                        </Alert>
                    )}

                    <Link
                        href="/auth/login"
                        className="text-center text-sm cursor-pointer text-primary"
                    >
                        {t('auth.resetPassword.back')}
                    </Link>
                </div>
            </div>
        </>
    )
}
