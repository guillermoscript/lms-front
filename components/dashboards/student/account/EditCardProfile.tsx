'use client'

import { Lock, User } from 'lucide-react'
import React from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import EditProfileDialog from './EditProfileDialog'

interface EditCardProfileProps {

}

const EditCardProfile: React.FC<EditCardProfileProps> = () => {
    const t = useScopedI18n('EnhancedProfilePage')

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('profileSettings')}</CardTitle>
                <CardDescription>{t('profileSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-6">
                    <div className="space-y-2">
                        <h3 className="font-semibold">{t('account')}</h3>
                        <div className="grid gap-4">
                            <div className="flex items-center justify-between p-4 rounded-lg border">
                                <div className="flex items-center gap-4">
                                    <User className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium">{t('personalInfo')}</p>
                                        <p className="text-sm text-muted-foreground">{t('personalInfoDesc')}</p>
                                    </div>
                                </div>
                                <EditProfileDialog>
                                    <Button variant="ghost">{t('edit')}</Button>
                                </EditProfileDialog>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-lg border">
                                <div className="flex items-center gap-4">
                                    <Lock className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium">{t('password')}</p>
                                        <p className="text-sm text-muted-foreground">{t('passwordDesc')}</p>
                                    </div>
                                </div>
                                <Button variant="ghost">{t('update')}</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

export default EditCardProfile
