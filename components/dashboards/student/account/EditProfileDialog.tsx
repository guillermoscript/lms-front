'use client'

import { useScopedI18n } from '@/app/locales/client'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogTrigger
} from '@/components/ui/dialog'

import EditProfile from './EditProfile'

export default function EditProfileDialog({
    children
}: {
    children: React.ReactNode
}) {
    const { t } = useScopedI18n('EnhancedProfilePage')
    return (
        <Dialog>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent>

                <CardHeader>
                    <CardTitle>Edit Profile</CardTitle>
                    <CardDescription>Update your profile details</CardDescription>
                </CardHeader>
                <CardContent>
                    <EditProfile />
                </CardContent>

            </DialogContent>
        </Dialog>
    )
}
