'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { IconBuilding, IconLoader2, IconUpload, IconX, IconPhoto } from '@tabler/icons-react'
import { useCertificateTemplate } from './certificate-template-context'

export function IssuerSection() {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const { formData, setFormData, logoInputRef, uploadingLogo, handleFileChange } = useCertificateTemplate()

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <IconBuilding className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                    {t('issuerDetails')}
                </h2>
            </div>

            <div className="space-y-4 pl-[42px]">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="issuer_name" className="text-sm font-medium">
                            {t('issuerNameLabel')}
                        </Label>
                        <Input
                            id="issuer_name"
                            value={formData.issuer_name}
                            onChange={e => setFormData(prev => ({ ...prev, issuer_name: e.target.value }))}
                            className="h-11"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="issuer_url" className="text-sm font-medium">
                            {t('issuerUrlLabel')}
                        </Label>
                        <Input
                            id="issuer_url"
                            value={formData.issuer_url}
                            onChange={e => setFormData(prev => ({ ...prev, issuer_url: e.target.value }))}
                            placeholder={t('issuerUrlPlaceholder')}
                            className="h-11"
                        />
                    </div>
                </div>

                {/* Logo upload */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('logoLabel')}</Label>
                    <p className="text-xs text-muted-foreground">{t('logoDescription')}</p>
                    <div className="flex items-center gap-3">
                        {formData.logo_url ? (
                            <div className="relative group">
                                <img
                                    src={formData.logo_url}
                                    alt="Logo"
                                    className="h-16 w-16 rounded-lg object-contain border bg-white p-1"
                                />
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
                                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <IconX className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <div className="h-16 w-16 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/40">
                                <IconPhoto className="h-6 w-6" />
                            </div>
                        )}
                        <div>
                            <input
                                ref={logoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleFileChange(e, 'logo')}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => logoInputRef.current?.click()}
                                disabled={uploadingLogo}
                                className="gap-1.5"
                            >
                                {uploadingLogo ? (
                                    <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                                ) : (
                                    <IconUpload className="h-3.5 w-3.5" />
                                )}
                                {formData.logo_url ? t('changeLogo') : t('uploadLogo')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
