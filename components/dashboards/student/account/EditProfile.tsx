'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { updateUserProfile } from '@/actions/dashboard/studentActions'
import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader } from 'lucide-react'

export const updateUserProfileSchema = z.object({
    fullName: z.string().min(1, { message: 'Full name is required.' }),
    avatarUrl: z.string().url({ message: 'Invalid URL.' }).or(z.literal('')),
    bio: z.string().optional()
})

type FormValues = z.infer<typeof updateUserProfileSchema>

export default function EditProfile() {
    const router = useRouter()
    const t = useScopedI18n('EditProfileForm')
    const form = useForm<FormValues>({
        resolver: zodResolver(updateUserProfileSchema),
        defaultValues: {
            fullName: '',
            avatarUrl: '',
            bio: ''
        }
    })

    const loading = form.formState.isSubmitting

    const onSubmit = async (data: FormValues) => {
        const result = await updateUserProfile(data)
        if (result.status === 'success') {
            toast.success(t('profileUpdatedSuccessfully'))
            router.refresh()
        } else {
            toast.error(t('errorUpdatingProfile'))
            console.error(result.message)
        }
    }

    return (
        <section className="max-w-lg mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">{t('updateProfile')}</h1>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('fullName')}</FormLabel>
                                <FormControl>
                                    <Input placeholder={t('fullNamePlaceholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="avatarUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('profilePicture')}</FormLabel>
                                <FormControl>
                                    <Input placeholder={t('profilePicturePlaceholder')} {...field} />
                                </FormControl>
                                <FormDescription>{t('validUrl')}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="bio"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('bio')}</FormLabel>
                                <FormControl>
                                    <Textarea placeholder={t('bioPlaceholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={loading}>
                        {loading ? <>
                            <Loader className="animate-spin" size={20} />
                        </> : t('updateProfile')}
                    </Button>
                </form>
            </Form>
        </section>
    )
}
