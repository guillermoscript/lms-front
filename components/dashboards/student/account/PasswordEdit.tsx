'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { updatePassword } from '@/actions/dashboard/userActions'
import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
// import { supabase } from '@/lib/supabaseClient' // Replace with your actual supabase client

const updatePasswordSchema = z
    .object({
        newPassword: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
        confirmPassword: z.string()
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: 'Passwords do not match.',
        path: ['confirmPassword']
    })

type FormValues = z.infer<typeof updatePasswordSchema>

const PasswordEdit: React.FC = () => {
    const t = useScopedI18n('PasswordEdit')

    const form = useForm<FormValues>({
        resolver: zodResolver(updatePasswordSchema),
        defaultValues: { newPassword: '', confirmPassword: '' }
    })

    const loading = form.formState.isSubmitting

    const onSubmit = async (data: FormValues) => {
        // Replace the following with your actual supabase call:
        const res = await updatePassword({
            newPassword: data.newPassword
        })

        if (res.status === 'success') {
            toast.success('Password updated')
        } else {
            toast.error('Error updating password')
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New Password</FormLabel>
                            <FormControl>
                                <Input type="password" placeholder="Enter new password" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                                <Input type="password" placeholder="Confirm new password" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" disabled={loading}>
                    {loading ? 'Updating...' : 'Update Password'}
                </Button>
            </form>
        </Form>
    )
}

export default PasswordEdit
