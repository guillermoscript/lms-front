'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import { updateUserProfile } from '@/actions/dashboard/studentActions'
import { Input } from '@/components/form/Form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

const schema = yup.object().shape({
    fullName: yup.string().required(),
    bio: yup.string().required(),
    avatarUrl: yup.string().url()
})

export type updateUserProfileSchema = yup.InferType<typeof schema>

export default function EditProfileForm () {
    const form = useForm<updateUserProfileSchema>({
        resolver: yupResolver(schema)
    })

    const { toast } = useToast()
    return (
        <FormProvider {...form}>
            <form
                onSubmit={form.handleSubmit(async (data) => {
                    try {
                        const response = await updateUserProfile(data)

                        console.log(response)
                        if (response.status === 'error') {
                            toast({
                                title: 'Error updating profile',
                                description: response.message,
                                variant: 'destructive'
                            })
                        } else if (response.status === 'success') {
                            toast({
                                title: 'Profile updated successfully'
                            })
                        }
                    } catch (error) {
                        console.log(error)
                        toast({
                            title: 'Error updating profile',
                            description: error.message,
                            variant: 'destructive'
                        })
                    }
                })}
                className='flex flex-col gap-4 w-full'
            >
                <Input
                    displayName="Full Name"
                    placeholder="John Doe"
                    type="text"
                    name='fullName'
                />
                <Input
                    displayName='Bio'
                    placeholder='Tell us about yourself'
                    type='text'
                    name='bio'
                />
                <Input
                    displayName='Profile Picture'
                    placeholder='https://example.com/image.jpg'
                    type='text'
                    name='avatarUrl'
                />
                <Button
                    disabled={form.formState.isSubmitting}
                >
                    {form.formState.isSubmitting ? 'Updating profile...' : 'Update Profile'}
                </Button>
            </form>
        </FormProvider>
    )
}
