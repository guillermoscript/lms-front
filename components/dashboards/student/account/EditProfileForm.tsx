'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import { updateUserProfile } from '@/actions/dashboard/studentActions'
import { useScopedI18n } from '@/app/locales/client'
import { Input } from '@/components/form/Form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

const schema = yup.object().shape({
    fullName: yup.string().required(),
    bio: yup.string().required(),
    avatarUrl: yup.string().url()
})

export type updateUserProfileSchema = yup.InferType<typeof schema>

export default function EditProfileForm ({
    fullName,
    bio,
    avatarUrl
}: {
    fullName: string
    bio: string
    avatarUrl: string
}) {
    const t = useScopedI18n('EditProfileForm')
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
                                title: t('errorUpdatingProfile'),
                                description: response.message,
                                variant: 'destructive'
                            })
                        } else if (response.status === 'success') {
                            toast({
                                title: t('profileUpdatedSuccessfully')
                            })
                        }
                    } catch (error) {
                        console.log(error)
                        toast({
                            title: t('errorUpdatingProfile'),
                            description: error.message,
                            variant: 'destructive'
                        })
                    }
                })}
                className='flex flex-col gap-4 w-full'
            >
                <Input
                    displayName={t('fullName')}
                    placeholder={fullName || t('fullNamePlaceholder')}
                    type="text"
                    name='fullName'
                />
                <Input
                    displayName={t('bio')}
                    placeholder={bio || t('bioPlaceholder')}
                    type='text'
                    name='bio'
                />
                <Input
                    displayName={t('profilePicture')}
                    placeholder={avatarUrl || t('profilePicturePlaceholder')}
                    type='text'
                    name='avatarUrl'
                />
                <Button
                    disabled={form.formState.isSubmitting}
                >
                    {form.formState.isSubmitting ? t('updatingProfile') : t('updateProfile')}
                </Button>
            </form>
        </FormProvider>
    )
}
