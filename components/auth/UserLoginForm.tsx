'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { EyeIcon, EyeOffIcon, Link } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { signIn } from '@/actions/auth/authActions'
import { useI18n } from '@/app/locales/client'
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

export default function UserLoginForm({ redirect }: { redirect?: string }) {
    const t = useI18n()

    // Define your Zod schema for validation
    const FormSchema = z.object({
        email: z.string().email({ message: t('auth.login.validations.invalid_email') }),
        password: z
            .string()
            .min(8, { message: t('auth.login.validations.password_min') })
            .max(100, { message: t('auth.login.validations.password_max') })
            .regex(/[a-z]/, { message: t('auth.login.validations.password_lower') })
            .regex(/[A-Z]/, { message: t('auth.login.validations.password_upper') })
            .regex(/\d/, { message: t('auth.login.validations.password_number') })
            .regex(/\W/, { message: t('auth.login.validations.password_symbol') })
            .nonempty({ message: t('auth.login.validations.password_required') }),
    })

    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    })

    const [error, setError] = useState('')

    const [showPassword, setShowPassword] = useState(false)

    const onSubmit = async (data: z.infer<typeof FormSchema>) => {
        try {
            setError('')
            // Assuming signIn function returns a promise
            const response = await signIn({
                email: data.email,
                password: data.password,
                redirectTo: redirect,
            })
        } catch (error: any) {
            // Handle login errors (e.g., display error messages)
            setError(error.message || 'An error occurred. Please try again.')
            toast.error(error.message || 'An error occurred. Please try again.')
        }
    }

    return (
        <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2">
            <Link
                href="/"
                className="absolute left-8 top-8 py-2 px-4 rounded-md no-underline text-foreground bg-btn-background hover:bg-btn-background-hover flex items-center group text-sm"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
                >
                    <polyline points="15 18 9 12 15 6" />
                </svg>{' '}
                Back
            </Link>
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="animate-in flex-1 flex flex-col w-full justify-center gap-4 text-foreground"
                >
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {' '}
                                    {t('auth.login.form.email')}
                                </FormLabel>
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
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {t('auth.login.form.password')}
                                </FormLabel>
                                <FormControl>
                                    <div className=" w-full gap-4 flex items-center justify-between">
                                        <Input
                                            type={
                                                showPassword
                                                    ? 'text'
                                                    : 'password'
                                            }
                                            name="password"
                                            placeholder="••••••••"
                                            {...field}
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowPassword(!showPassword)
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
                    {/* Optional hidden input for redirect if needed */}
                    {redirect && (
                        <input type="hidden" name="redirect" value={redirect} />
                    )}
                    <Button
                        disabled={form.formState.isSubmitting}
                        type="submit"
                    >
                        {form.formState.isSubmitting
                            ? t('auth.login.form.loggingIn')
                            : t('auth.login.form.login')}
                    </Button>

                    {error && (
                        <p className="text-red-500 text-sm text-center">
                            {error}
                        </p>
                    )}
                </form>
            </Form>
        </div>
    )
}
