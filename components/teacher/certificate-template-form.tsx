'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { IconDeviceFloppy, IconLoader2, IconPalette, IconEye } from '@tabler/icons-react'
import { CertificatePreview } from './certificate-preview'

interface CertificateTemplateFormProps {
    courseId: number
    initialData?: any
}

export function CertificateTemplateForm({ courseId, initialData }: CertificateTemplateFormProps) {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const router = useRouter()
    const supabase = createClient()

    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState({
        template_name: initialData?.template_name || '',
        issuer_name: initialData?.issuer_name || process.env.NEXT_PUBLIC_APP_NAME || 'LMS Academy',
        issuer_url: initialData?.issuer_url || process.env.NEXT_PUBLIC_APP_URL || '',
        description: initialData?.description || '',
        issuance_criteria: initialData?.issuance_criteria || '',
        design_settings: initialData?.design_settings || {
            primary_color: '#3B82F6',
            secondary_color: '#1E40AF',
            show_qr_code: true
        }
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            const { error } = await supabase
                .from('certificate_templates')
                .upsert({
                    course_id: courseId,
                    template_name: formData.template_name,
                    issuer_name: formData.issuer_name,
                    issuer_url: formData.issuer_url,
                    description: formData.description,
                    issuance_criteria: formData.issuance_criteria,
                    design_settings: formData.design_settings,
                    updated_at: new Date().toISOString()
                })

            if (error) {
                console.error('Supabase error saving template:', error)
                throw error
            }

            toast.success(t('saveSuccess'))
            router.refresh()
        } catch (error: any) {
            const errorMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))
            console.error('Error saving template:', errorMsg)
            toast.error(t('saveError'))
        } finally {
            setIsLoading(false)
        }
    }

    const updateDesignSetting = (key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            design_settings: {
                ...prev.design_settings,
                [key]: value
            }
        }))
    }

    return (
        <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('title')}</CardTitle>
                            <CardDescription>{t('description')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="template_name">{t('nameLabel')}</Label>
                                <Input
                                    id="template_name"
                                    value={formData.template_name}
                                    onChange={e => setFormData(prev => ({ ...prev, template_name: e.target.value }))}
                                    placeholder={t('namePlaceholder')}
                                    required
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="issuer_name">{t('issuerNameLabel')}</Label>
                                    <Input
                                        id="issuer_name"
                                        value={formData.issuer_name}
                                        onChange={e => setFormData(prev => ({ ...prev, issuer_name: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="issuer_url">{t('issuerUrlLabel')}</Label>
                                    <Input
                                        id="issuer_url"
                                        value={formData.issuer_url}
                                        onChange={e => setFormData(prev => ({ ...prev, issuer_url: e.target.value }))}
                                        placeholder={t('issuerUrlPlaceholder')}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">{t('descriptionLabel')}</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder={t('descriptionPlaceholder')}
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="issuance_criteria">{t('criteriaLabel')}</Label>
                                <Textarea
                                    id="issuance_criteria"
                                    value={formData.issuance_criteria}
                                    onChange={e => setFormData(prev => ({ ...prev, issuance_criteria: e.target.value }))}
                                    placeholder={t('criteriaPlaceholder')}
                                    rows={2}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <IconPalette size={20} /> {t('design')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-6 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>{t('primaryColor')}</Label>
                                    <div className="flex items-center gap-3">
                                        <Input
                                            type="color"
                                            value={formData.design_settings.primary_color}
                                            onChange={e => updateDesignSetting('primary_color', e.target.value)}
                                            className="h-10 w-20 p-1"
                                        />
                                        <code className="text-sm font-mono">{formData.design_settings.primary_color}</code>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('secondaryColor')}</Label>
                                    <div className="flex items-center gap-3">
                                        <Input
                                            type="color"
                                            value={formData.design_settings.secondary_color}
                                            onChange={e => updateDesignSetting('secondary_color', e.target.value)}
                                            className="h-10 w-20 p-1"
                                        />
                                        <code className="text-sm font-mono">{formData.design_settings.secondary_color}</code>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>{t('showQrCode')}</Label>
                                    <p className="text-sm text-muted-foreground">
                                        {t('qrCodeDescription')}
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.design_settings.show_qr_code}
                                    onCheckedChange={checked => updateDesignSetting('show_qr_code', checked)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.back()}
                            disabled={isLoading}
                        >
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <IconDeviceFloppy className="mr-2 h-4 w-4" />
                            )}
                            {t('submit')}
                        </Button>
                    </div>
                </form>
            </div>

            <div className="lg:sticky lg:top-8 h-fit space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold px-1">
                    <IconEye size={20} className="text-primary" />
                    {t('preview.title')}
                </div>
                <div className="scale-[0.85] origin-top transform-gpu">
                    <CertificatePreview
                        templateName={formData.template_name}
                        issuerName={formData.issuer_name}
                        designSettings={formData.design_settings}
                    />
                </div>
                <p className="text-center text-xs text-muted-foreground italic">
                    * This is a live preview of how the certificate will appear to your students.
                </p>
            </div>
        </div>
    )
}
