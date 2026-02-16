'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    IconAward,
    IconDownload,
    IconShare,
    IconExternalLink,
    IconShieldCheck
} from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { SocialShareModal } from './social-share-modal'

interface StudentCertificateCardProps {
    certificate: any
}

export function StudentCertificateCard({ certificate }: StudentCertificateCardProps) {
    const t = useTranslations('dashboard.student.profile.certificates')

    const [isShareModalOpen, setIsShareModalOpen] = useState(false)

    return (
        <>
            <Card className="overflow-hidden border border-border hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row">
                    {/* Preview / Icon Side */}
                    <div
                        className="w-full sm:w-32 bg-primary/5 flex items-center justify-center p-6 sm:p-0"
                        style={{ borderLeft: `4px solid ${certificate.certificate_templates?.design_settings?.primary_color || 'var(--primary)'}` }}
                    >
                        <IconAward size={48} className="text-primary/40" />
                    </div>

                    {/* Content Side */}
                    <CardContent className="flex-1 p-6">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-lg leading-tight">
                                        {certificate.certificate_templates?.template_name || certificate.courses?.title}
                                    </h3>
                                    <Badge variant="outline" className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 bg-emerald-50 border-emerald-200">
                                        <IconShieldCheck size={10} className="mr-1" /> Verified
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {certificate.courses?.title}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        {t('issuedBy', { issuer: certificate.certificate_templates?.issuer_name || 'LMS Academy' })}
                                    </span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        {t('issuedOn', { date: new Date(certificate.issued_at).toLocaleDateString() })}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <a href={certificate.pdf_url || `/api/certificates/${certificate.certificate_id}`} target="_blank" rel="noopener noreferrer">
                                    <Button variant="outline" size="sm" className="h-9">
                                        <IconDownload className="mr-2 h-4 w-4" />
                                        {t('download')}
                                    </Button>
                                </a>
                                <Link href={`/verify/${certificate.verification_code}`}>
                                    <Button variant="outline" size="sm" className="h-9">
                                        <IconExternalLink className="mr-2 h-4 w-4" />
                                        {t('verify')}
                                    </Button>
                                </Link>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-9 shadow-sm"
                                    onClick={() => setIsShareModalOpen(true)}
                                >
                                    <IconShare className="mr-2 h-4 w-4" />
                                    {t('share')}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </div>
            </Card>

            <SocialShareModal
                isOpen={isShareModalOpen}
                onOpenChange={setIsShareModalOpen}
                certificate={certificate}
            />
        </>
    )
}
