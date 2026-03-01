'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    IconDownload,
    IconShare,
    IconExternalLink,
    IconShieldCheck,
    IconCalendar,
    IconUser,
} from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { SocialShareModal } from './social-share-modal'
import { cn } from '@/lib/utils'

interface StudentCertificateCardProps {
    certificate: any
}

export function StudentCertificateCard({ certificate }: StudentCertificateCardProps) {
    const t = useTranslations('dashboard.student.profile.certificates')
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)

    const designSettings = certificate.certificate_templates?.design_settings
    const primaryColor = designSettings?.primary_color || '#3b82f6'
    const courseTitle = certificate.courses?.title || 'Course'
    const templateName = certificate.certificate_templates?.template_name
    const issuerName = certificate.certificate_templates?.issuer_name || 'LMS Academy'
    const issuedDate = new Date(certificate.issued_at)

    return (
        <>
            <div className="group relative overflow-hidden rounded-2xl border bg-card hover:shadow-lg transition-all duration-300">
                {/* Top color accent */}
                <div
                    className="h-1"
                    style={{ background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}80, transparent)` }}
                />

                <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row gap-5">
                        {/* Certificate Mini-Preview */}
                        <div
                            className="relative shrink-0 w-full sm:w-40 h-28 sm:h-auto rounded-xl overflow-hidden border-2 flex items-center justify-center"
                            style={{
                                borderColor: `${primaryColor}30`,
                                background: `linear-gradient(135deg, ${primaryColor}08, ${primaryColor}03)`,
                            }}
                        >
                            {/* Decorative inner border */}
                            <div
                                className="absolute inset-2 rounded-lg border border-dashed"
                                style={{ borderColor: `${primaryColor}20` }}
                            />

                            {/* Mini certificate content */}
                            <div className="relative text-center px-4 py-3">
                                <div
                                    className="text-[8px] font-bold uppercase tracking-[0.2em] mb-1"
                                    style={{ color: `${primaryColor}90` }}
                                >
                                    Certificate
                                </div>
                                <div className="text-[10px] font-bold leading-tight line-clamp-2 text-foreground/80">
                                    {courseTitle}
                                </div>
                                <div
                                    className="w-8 h-[1px] mx-auto mt-1.5 mb-1"
                                    style={{ background: `linear-gradient(90deg, transparent, ${primaryColor}60, transparent)` }}
                                />
                                <div className="text-[7px] text-muted-foreground/60 uppercase tracking-wider">
                                    {issuedDate.toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-base leading-tight truncate">
                                            {templateName || courseTitle}
                                        </h3>
                                        <Badge
                                            variant="outline"
                                            className="text-[9px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shrink-0"
                                        >
                                            <IconShieldCheck size={9} className="mr-0.5" />
                                            Verified
                                        </Badge>
                                    </div>
                                    {templateName && (
                                        <p className="text-sm text-muted-foreground truncate">{courseTitle}</p>
                                    )}
                                </div>
                            </div>

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                    <IconUser size={11} className="text-muted-foreground/50" />
                                    {t('issuedBy', { issuer: issuerName })}
                                </span>
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                    <IconCalendar size={11} className="text-muted-foreground/50" />
                                    {t('issuedOn', { date: issuedDate.toLocaleDateString() })}
                                </span>
                            </div>

                            {/* Verification code */}
                            <div className="flex items-center gap-2">
                                <code className="text-[10px] font-mono text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded">
                                    {certificate.verification_code}
                                </code>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 pt-1">
                                <a href={`/api/certificates/${certificate.certificate_id}`} target="_blank" rel="noreferrer">
                                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5">
                                        <IconExternalLink size={13} />
                                        {t('view')}
                                    </Button>
                                </a>
                                <a href={`/api/certificates/${certificate.certificate_id}?format=pdf`} download>
                                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5">
                                        <IconDownload size={13} />
                                        {t('download')}
                                    </Button>
                                </a>
                                <Link href={`/verify/${certificate.verification_code}`}>
                                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5">
                                        <IconShieldCheck size={13} />
                                        {t('verify')}
                                    </Button>
                                </Link>
                                <Button
                                    size="sm"
                                    className="h-8 text-xs font-semibold gap-1.5 shadow-sm"
                                    onClick={() => setIsShareModalOpen(true)}
                                >
                                    <IconShare size={13} />
                                    {t('share')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <SocialShareModal
                isOpen={isShareModalOpen}
                onOpenChange={setIsShareModalOpen}
                certificate={certificate}
            />
        </>
    )
}
