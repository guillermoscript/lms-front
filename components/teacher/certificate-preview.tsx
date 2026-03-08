'use client'

import { IconAward, IconQrcode, IconShieldCheck } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface CertificatePreviewProps {
    templateName: string
    issuerName: string
    designSettings: {
        primary_color: string
        secondary_color: string
        show_qr_code: boolean
    }
}

export function CertificatePreview({ templateName, issuerName, designSettings }: CertificatePreviewProps) {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')

    const mockStudentName = "Jane Doe"
    const mockDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const mockCode = "VERIFY-MOCK-12345"

    return (
        <div className="relative overflow-hidden rounded-xl border-2 bg-white shadow-xl">
            {/* Decorative border */}
            <div className="absolute inset-2 border-2 border-dashed rounded-lg pointer-events-none opacity-[0.08]"
                style={{ borderColor: designSettings.primary_color }}
            />

            {/* Top accent stripe */}
            <div className="h-2 w-full" style={{
                background: `linear-gradient(135deg, ${designSettings.primary_color}, ${designSettings.secondary_color})`
            }} />

            <div className="px-10 py-8 flex flex-col items-center text-center space-y-6">
                {/* Award icon */}
                <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{
                        background: `linear-gradient(135deg, ${designSettings.primary_color}15, ${designSettings.secondary_color}15)`,
                        color: designSettings.primary_color
                    }}
                >
                    <IconAward size={36} stroke={1.5} />
                </div>

                {/* Header text */}
                <div className="space-y-1.5">
                    <h3
                        className="text-[13px] font-bold uppercase tracking-[0.25em]"
                        style={{ color: designSettings.primary_color }}
                    >
                        {t('preview.header')}
                    </h3>
                    <p className="text-[11px] text-gray-400 tracking-wide">{t('preview.certifyThat')}</p>
                </div>

                {/* Student name */}
                <div className="space-y-3 w-full">
                    <h2 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
                        {mockStudentName}
                    </h2>
                    <div className="mx-auto w-32 h-px" style={{
                        background: `linear-gradient(90deg, transparent, ${designSettings.primary_color}40, transparent)`
                    }} />
                    <p className="text-sm text-gray-500 leading-relaxed">
                        {t('preview.successfullyCompleted')}
                    </p>
                </div>

                {/* Course / Template name */}
                <h1
                    className="text-xl font-bold leading-tight px-4"
                    style={{ color: designSettings.secondary_color }}
                >
                    {templateName || t('preview.courseTitle')}
                </h1>

                {/* Signatures row */}
                <div className="w-full grid grid-cols-2 gap-8 pt-4 mt-2">
                    <div className="text-left space-y-1.5">
                        <div className="h-px w-full bg-gray-200" />
                        <p className="font-semibold text-sm text-gray-800">{issuerName || "LMS Academy"}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{t('preview.officialIssuer')}</p>
                    </div>
                    <div className="text-right space-y-1.5">
                        <div className="h-px w-full bg-gray-200" />
                        <p className="font-semibold text-sm text-gray-800">{mockDate}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{t('preview.issueDate')}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-4 w-full flex items-center justify-between border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                        <IconShieldCheck size={14} />
                        <span className="uppercase tracking-wider font-medium">{t('preview.verified')}</span>
                    </div>

                    {designSettings.show_qr_code && (
                        <div className="flex items-center gap-2.5">
                            <div className="text-right">
                                <p className="text-[9px] text-gray-400 font-mono">{mockCode}</p>
                            </div>
                            <div
                                className="p-1.5 rounded-md bg-gray-50 border border-gray-100"
                                style={{ color: designSettings.primary_color }}
                            >
                                <IconQrcode size={28} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Corner accents */}
            <div
                className="absolute top-0 right-0 w-24 h-24 -mr-12 -mt-12 rounded-full opacity-[0.06]"
                style={{ backgroundColor: designSettings.secondary_color }}
            />
            <div
                className="absolute bottom-0 left-0 w-24 h-24 -ml-12 -mb-12 rounded-full opacity-[0.06]"
                style={{ backgroundColor: designSettings.primary_color }}
            />
        </div>
    )
}
