import EditProfileForm from '@/components/dashboards/student/account/EditProfileForm'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'

export default function Dashboard () {
    return (
        <>
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
                            <EditProfileForm />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    )
}
