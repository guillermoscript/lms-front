'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { IconSignature, IconLoader2, IconUpload, IconX } from '@tabler/icons-react'
import { useCertificateTemplate } from './certificate-template-context'

export function SignatureSection() {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const { formData, setFormData, signatureInputRef, uploadingSignature, handleFileChange } = useCertificateTemplate()

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <IconSignature className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
                    {t('signature')}
                </h2>
            </div>

            <div className="space-y-4 pl-[42px]">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="signature_name" className="text-sm font-medium">
                            {t('signatureNameLabel')}
                        </Label>
                        <Input
                            id="signature_name"
                            value={formData.signature_name}
                            onChange={e => setFormData(prev => ({ ...prev, signature_name: e.target.value }))}
                            placeholder={t('signatureNamePlaceholder')}
                            className="h-11"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="signature_title" className="text-sm font-medium">
                            {t('signatureTitleLabel')}
                        </Label>
                        <Input
                            id="signature_title"
                            value={formData.signature_title}
                            onChange={e => setFormData(prev => ({ ...prev, signature_title: e.target.value }))}
                            placeholder={t('signatureTitlePlaceholder')}
                            className="h-11"
                        />
                    </div>
                </div>

                {/* Signature image upload */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('signatureImageLabel')}</Label>
                    <p className="text-xs text-muted-foreground">{t('signatureImageDescription')}</p>
                    <div className="flex items-center gap-3">
                        {formData.signature_image_url ? (
                            <div className="relative group">
                                <img
                                    src={formData.signature_image_url}
                                    alt="Signature"
                                    className="h-12 w-32 rounded-lg object-contain border bg-white p-1"
                                />
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, signature_image_url: '' }))}
                                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <IconX className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <div className="h-12 w-32 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/40">
                                <IconSignature className="h-5 w-5" />
                            </div>
                        )}
                        <div>
                            <input
                                ref={signatureInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleFileChange(e, 'signature')}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => signatureInputRef.current?.click()}
                                disabled={uploadingSignature}
                                className="gap-1.5"
                            >
                                {uploadingSignature ? (
                                    <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                                ) : (
                                    <IconUpload className="h-3.5 w-3.5" />
                                )}
                                {formData.signature_image_url ? t('changeSignature') : t('uploadSignature')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
