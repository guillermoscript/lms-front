'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

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

const updatePasswordSchema = z
    .object({
        currentPassword: z.string().min(6, { message: 'Current password must be at least 6 characters.' }),
        newPassword: z.string().min(6, { message: 'New password must be at least 6 characters.' }),
        confirmNewPassword: z.string().min(6, { message: 'Confirm password must be at least 6 characters.' })
    })
    .refine(data => data.newPassword === data.confirmNewPassword, {
        message: 'New passwords do not match.',
        path: ['confirmNewPassword'],
    })

type FormValues = z.infer<typeof updatePasswordSchema>

export default function EditUserPassword() {
    const router = useRouter()
    const { t } = useScopedI18n('EnhancedProfilePage')
    const form = useForm<FormValues>({
        resolver: zodResolver(updatePasswordSchema),
        defaultValues: {
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: ''
        }
    })

    const loading = form.formState.isSubmitting

    const onSubmit = async (data: FormValues) => {
        try {
            const res = await fetch('/api/password', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: data.currentPassword.trim(),
                    newPassword: data.newPassword.trim()
                })
            })
            if (res.ok) {
                toast.success(t('passwordUpdated') || 'Password updated successfully')
                router.refresh()
            } else {
                const result = await res.json()
                toast.error(result.message || t('passwordUpdateError') || 'Failed to update password')
            }
        } catch (error) {
            toast.error(t('passwordUpdateError') || 'Failed to update password')
            console.error(error)
        }
    }

    return (
        <section className="max-w-lg mx-auto p-4">
            <h2 className="text-2xl font-bold mb-4">{t('changePassword') || 'Change Password'}</h2>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="currentPassword"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('currentPassword') || 'Current Password'}</FormLabel>
                                <FormControl>
                                    <Input type="password" placeholder="Enter current password" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="newPassword"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('newPassword') || 'New Password'}</FormLabel>
                                <FormControl>
                                    <Input type="password" placeholder="Enter new password" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="confirmNewPassword"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('confirmNewPassword') || 'Confirm New Password'}</FormLabel>
                                <FormControl>
                                    <Input type="password" placeholder="Confirm new password" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={loading}>
                        {loading ? t('saving') || 'Saving...' : t('saveChanges') || 'Save Changes'}
                    </Button>
                </form>
            </Form>
        </section>
    )
}
