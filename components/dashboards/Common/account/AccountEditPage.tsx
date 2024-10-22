import { getScopedI18n } from '@/app/locales/server'
import EditProfileForm from '@/components/dashboards/student/account/EditProfileForm'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'

export default async function AccountEditPage () {
    const t = await getScopedI18n('AccountEditPage')
    const supabase = createClient()
    const {
        data: { user },
        error
    } = await supabase.auth.getUser()

    if (error != null) {
        throw new Error(error.message)
    }

    const userProfile = await supabase
        .from('profiles')
        .select('full_name, bio, avatar_url')
        .eq('id', user?.id)
        .single()

    return (
        <>
            <div className="mx-auto grid w-full gap-2">
                <h1 className="text-3xl font-semibold">{t('settings')}</h1>
            </div>
            <div className="mx-auto grid w-full gap-2">
                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {t('editProfile')}
                            </CardTitle>
                            <CardDescription>
                                {t('updateProfileInfo')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col  gap-4">
                            <EditProfileForm
                                fullName={userProfile.data.full_name}
                                bio={userProfile.data.bio}
                                avatarUrl={userProfile.data.avatar_url}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    )
}
