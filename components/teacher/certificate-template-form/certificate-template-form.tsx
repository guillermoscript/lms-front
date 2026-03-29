'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { IconDeviceFloppy, IconLoader2 } from '@tabler/icons-react'
import { CertificatePreview } from '../certificate-preview'
import { CertificateTemplateProvider, useCertificateTemplate } from './certificate-template-context'
import type { CertificateTemplateFormProps } from './certificate-template-context'
import { CertificateInfoSection } from './certificate-info-section'
import { IssuerSection } from './issuer-section'
import { SignatureSection } from './signature-section'
import { CompletionCriteriaSection } from './completion-criteria-section'
import { ExpirationSection } from './expiration-section'
import { DesignSection } from './design-section'

export function CertificateTemplateForm(props: CertificateTemplateFormProps) {
    return (
        <CertificateTemplateProvider {...props}>
            <CertificateTemplateFormShell />
        </CertificateTemplateProvider>
    )
}

function CertificateTemplateFormShell() {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const { formData, isLoading, handleSubmit, goBack } = useCertificateTemplate()

    return (
        <div className="grid gap-8 lg:grid-cols-5">
            {/* Form side */}
            <div className="lg:col-span-3">
                <form onSubmit={handleSubmit} className="space-y-8">
                    <CertificateInfoSection />
                    <IssuerSection />
                    <SignatureSection />
                    <CompletionCriteriaSection />
                    <ExpirationSection />
                    <DesignSection />

                    {/* Submit buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={goBack}
                            disabled={isLoading}
                        >
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={isLoading} className="gap-2 px-6">
                            {isLoading ? (
                                <IconLoader2 className="h-4 w-4 motion-safe:animate-spin" />
                            ) : (
                                <IconDeviceFloppy className="h-4 w-4" />
                            )}
                            {t('submit')}
                        </Button>
                    </div>
                </form>
            </div>

            {/* Preview side */}
            <div className="lg:col-span-2 lg:sticky lg:top-8 h-fit space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70 px-1">
                    {t('preview.title')}
                </h2>
                <div className="scale-[0.8] origin-top transform-gpu">
                    <CertificatePreview
                        templateName={formData.template_name}
                        issuerName={formData.issuer_name}
                        designSettings={formData.design_settings}
                        signatureName={formData.signature_name}
                        signatureTitle={formData.signature_title}
                        signatureImageUrl={formData.signature_image_url}
                        logoUrl={formData.logo_url}
                    />
                </div>
                <p className="text-center text-[10px] text-muted-foreground italic">
                    {t('preview.livePreviewHint')}
                </p>
            </div>
        </div>
    )
}
