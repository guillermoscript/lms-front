'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { IconFileText } from '@tabler/icons-react'
import { useCertificateTemplate } from './certificate-template-context'

export function CertificateInfoSection() {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const { formData, setFormData } = useCertificateTemplate()

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <IconFileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                    {t('certificateInfo')}
                </h2>
            </div>

            <div className="space-y-4 pl-[42px]">
                <div className="space-y-2">
                    <Label htmlFor="template_name" className="text-sm font-medium">
                        {t('nameLabel')}
                    </Label>
                    <Input
                        id="template_name"
                        value={formData.template_name}
                        onChange={e => setFormData(prev => ({ ...prev, template_name: e.target.value }))}
                        placeholder={t('namePlaceholder')}
                        className="h-11"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium">
                        {t('descriptionLabel')}
                    </Label>
                    <Textarea
                        id="description"
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={t('descriptionPlaceholder')}
                        rows={3}
                        className="resize-none"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="issuance_criteria" className="text-sm font-medium">
                        {t('criteriaLabel')}
                    </Label>
                    <Textarea
                        id="issuance_criteria"
                        value={formData.issuance_criteria}
                        onChange={e => setFormData(prev => ({ ...prev, issuance_criteria: e.target.value }))}
                        placeholder={t('criteriaPlaceholder')}
                        rows={2}
                        className="resize-none"
                    />
                </div>
            </div>
        </div>
    )
}
