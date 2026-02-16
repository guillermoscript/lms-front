'use client'

import { Card } from '@/components/ui/card'
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

    // Mock data for preview
    const mockStudentName = "John Doe"
    const mockDate = new Date().toLocaleDateString()
    const mockCode = "VERIFY-MOCK-12345"

    return (
        <div className="relative overflow-hidden rounded-xl border bg-white shadow-2xl transition-all duration-500 ease-in-out">
            {/* Certificate Border decoration */}
            <div
                className="absolute inset-0 border-[16px] pointer-events-none opacity-10"
                style={{ borderColor: designSettings.primary_color }}
            />

            <div className="p-12 flex flex-col items-center text-center space-y-8">
                {/* Header Decoration */}
                <div
                    className="w-24 h-24 rounded-full flex items-center justify-center bg-opacity-10 mb-2"
                    style={{ backgroundColor: `${designSettings.primary_color}20`, color: designSettings.primary_color }}
                >
                    <IconAward size={48} stroke={1.5} />
                </div>

                <div className="space-y-2">
                    <h3 className="text-xl font-medium text-gray-400 uppercase tracking-widest">
                        {t('preview.header')}
                    </h3>
                    <p className="text-sm text-gray-500">{t('preview.certifyThat')}</p>
                </div>

                <div className="space-y-4">
                    <h2 className="text-4xl font-bold font-serif text-gray-900 border-b-2 border-gray-100 pb-2 px-8">
                        {mockStudentName}
                    </h2>
                    <p className="text-lg text-gray-600">
                        {t('preview.successfullyCompleted')}
                    </p>
                    <h1
                        className="text-3xl font-bold leading-tight"
                        style={{ color: designSettings.secondary_color }}
                    >
                        {templateName || "Course Title"}
                    </h1>
                </div>

                <div className="w-full grid grid-cols-2 gap-12 pt-8 border-t border-gray-100">
                    <div className="text-left space-y-1">
                        <div className="h-px w-full bg-gray-300 mb-2" />
                        <p className="font-bold text-gray-900">{issuerName || "LMS Academy"}</p>
                        <p className="text-sm text-gray-500">{t('preview.officialIssuer')}</p>
                    </div>
                    <div className="text-right space-y-1">
                        <div className="h-px w-full bg-gray-300 mb-2" />
                        <p className="font-bold text-gray-900">{mockDate}</p>
                        <p className="text-sm text-gray-500">{t('preview.issueDate')}</p>
                    </div>
                </div>

                {/* Footer / Security Info */}
                <div className="pt-8 w-full flex items-center justify-between border-t border-gray-50">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <IconShieldCheck size={16} />
                        <span>{t('preview.verified')}</span>
                    </div>

                    {designSettings.show_qr_code && (
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-[10px] text-gray-400 font-mono">{mockCode}</p>
                                <p className="text-[8px] text-gray-400">verify.lms.com</p>
                            </div>
                            <div
                                className="p-1 rounded bg-gray-50 border border-gray-100"
                                style={{ color: designSettings.primary_color }}
                            >
                                <IconQrcode size={32} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Corner Decorative elements */}
            <div
                className="absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-10"
                style={{ backgroundColor: designSettings.secondary_color }}
            />
            <div
                className="absolute bottom-0 left-0 w-32 h-32 -ml-16 -mb-16 rounded-full opacity-10"
                style={{ backgroundColor: designSettings.primary_color }}
            />
        </div>
    )
}
