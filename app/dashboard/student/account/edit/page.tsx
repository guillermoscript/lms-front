import EditProfileForm from '@/components/dashboards/student/account/EditProfileForm'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'

export default async function Dashboard () {
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
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/student', label: 'Student' },
                    { href: '/dashboard/student/account', label: 'Account' },
                    { href: '/dashboard/student/account/edit', label: 'Edit' }
                ]}
            />
            <div className="mx-auto grid w-full max-w-6xl gap-2">
                <h1 className="text-3xl font-semibold">Settings</h1>
            </div>
            <div className="mx-auto grid w-full max-w-6xl gap-2">
                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                Edit Profile
                            </CardTitle>
                            <CardDescription>
                Update your profile information
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
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
