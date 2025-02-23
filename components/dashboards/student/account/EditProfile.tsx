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

export const updateUserProfileSchema = z.object({
    fullName: z.string().min(1, { message: 'Full name is required.' }),
    avatarUrl: z.string().url({ message: 'Invalid URL.' }).or(z.literal('')),
    bio: z.string().optional()
})

type FormValues = z.infer<typeof updateUserProfileSchema>

export default function EditProfile() {
    const router = useRouter()
    const t = useScopedI18n('EnhancedProfilePage')
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
            toast.success(t('profileUpdated'))
            router.refresh()
        } else {
            toast.error(t('profileUpdateError'))
            console.error(result.message)
        }
    }

    return (
        <section className="max-w-lg mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Edit Profile</h1>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Full Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="Enter your full name" {...field} />
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
                                <FormLabel>Avatar URL</FormLabel>
                                <FormControl>
                                    <Input placeholder="Enter your avatar URL" {...field} />
                                </FormControl>
                                <FormDescription>This should be a valid URL.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="bio"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Bio</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Tell us about yourself" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                </form>
            </Form>
        </section>
    )
}
