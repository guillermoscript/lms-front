'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { IconClock } from '@tabler/icons-react'
import { useCertificateTemplate } from './certificate-template-context'

export function ExpirationSection() {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const { formData, setFormData } = useCertificateTemplate()

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <IconClock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                    {t('expiration')}
                </h2>
            </div>

            <div className="space-y-4 pl-[42px]">
                <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-medium">{t('enableExpiration')}</Label>
                        <p className="text-xs text-muted-foreground">{t('enableExpirationHint')}</p>
                    </div>
                    <Switch
                        checked={formData.expiration_days !== null}
                        onCheckedChange={checked => setFormData(prev => ({
                            ...prev,
                            expiration_days: checked ? 365 : null
                        }))}
                    />
                </div>

                {formData.expiration_days !== null && (
                    <div className="space-y-2">
                        <Label htmlFor="expiration_days" className="text-sm font-medium">
                            {t('expirationDays')}
                        </Label>
                        <div className="flex items-center gap-3">
                            <Input
                                id="expiration_days"
                                type="number"
                                min={1}
                                max={3650}
                                value={formData.expiration_days ?? 365}
                                onChange={e => setFormData(prev => ({
                                    ...prev,
                                    expiration_days: parseInt(e.target.value) || 365
                                }))}
                                className="h-11 w-32"
                            />
                            <span className="text-sm text-muted-foreground">{t('days')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {formData.expiration_days
                                ? t('expirationPreview', { years: (formData.expiration_days / 365).toFixed(1) })
                                : ''}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
