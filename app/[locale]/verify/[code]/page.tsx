import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations, getLocale } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import {
    IconShieldCheck,
    IconShieldX,
    IconDownload,
    IconExternalLink,
    IconCheck,
    IconX,
} from '@tabler/icons-react'
import Link from 'next/link'

interface PageProps {
    params: Promise<{ code: string }>
}

export default async function VerificationPage({ params }: PageProps) {
    const { code } = await params
    const supabase = createAdminClient()
    const t = await getTranslations('verification')
    const locale = await getLocale()

    const dateLocale = locale === 'es' ? 'es-ES' : 'en-US'

    const { data: certificate, error } = await supabase
        .from('certificates')
        .select(`
      *,
      profiles!certificates_user_id_fkey(full_name, avatar_url),
      courses(course_id, title),
      certificate_templates(*)
    `)
        .eq('verification_code', code)
        .single()

    if (error || !certificate) {
        return (
            <div className="min-h-screen bg-[#f7f5f2] dark:bg-[#1a1917] flex items-center justify-center p-4">
                <div className="max-w-sm w-full text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/30 mb-6">
                        <IconShieldX size={32} className="text-red-500 dark:text-red-400" />
                    </div>
                    <h1 className="text-2xl font-semibold text-[#3a3632] dark:text-[#d4cfc8] mb-3">
                        {t('notFound.title')}
                    </h1>
                    <p className="text-sm text-[#8a8578] dark:text-[#7a756e] mb-8 leading-relaxed">
                        {t('notFound.description')}
                    </p>
                    <Link href="/">
                        <Button variant="outline" className="border-[#ddd8d2] dark:border-[#3a3836] text-[#3a3632] dark:text-[#d4cfc8]">
                            {t('notFound.returnHome')}
                        </Button>
                    </Link>
                </div>
            </div>
        )
    }

    const isRevoked = !!certificate.revoked_at
    const primaryColor = certificate.certificate_templates?.design_settings?.primary_color || '#1a5632'
    const secondaryColor = certificate.certificate_templates?.design_settings?.secondary_color || '#0f2b1a'

    const courseTitle =
        certificate.courses?.title ||
        (certificate.credential_json as any)?.credentialSubject?.achievement?.name ||
        'Course'
    const courseStillExists = !!certificate.courses?.course_id

    const studentName = certificate.profiles?.full_name || 'Student'
    const issuerName = certificate.certificate_templates?.issuer_name || 'LMS Platform'
    const issuedDate = new Date(certificate.issued_at).toLocaleDateString(dateLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
    const expiresAt = certificate.expires_at
        ? new Date(certificate.expires_at).toLocaleDateString(dateLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
        : null

    const score = certificate.completion_data?.averageExamScore ?? null
    const logoUrl = certificate.certificate_templates?.logo_url || certificate.certificate_templates?.design_settings?.logo_url || null
    const sigName = certificate.certificate_templates?.signature_name || null
    const sigTitle = certificate.certificate_templates?.signature_title || null

    return (
        <div className="min-h-screen bg-[#f7f5f2] dark:bg-[#1a1917]">
            {/* Ambient background texture */}
            <div
                className="fixed inset-0 opacity-[0.015] dark:opacity-[0.03] pointer-events-none"
                style={{
                    backgroundImage: `radial-gradient(${primaryColor} 0.5px, transparent 0.5px)`,
                    backgroundSize: '24px 24px',
                }}
            />

            <div className="relative max-w-2xl mx-auto px-4 py-12 sm:py-20">
                {/* Header — verification status */}
                <header className="text-center mb-12">
                    {isRevoked ? (
                        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 mb-6">
                            <IconShieldX size={18} className="text-red-600 dark:text-red-400" />
                            <span className="text-sm font-medium text-red-700 dark:text-red-400 tracking-wide">
                                {t('certificateRevoked')}
                            </span>
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 mb-6">
                            <IconShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 tracking-wide">
                                {t('verifiedCredential')}
                            </span>
                        </div>
                    )}

                    <h1
                        className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] mb-3"
                        style={{ color: isRevoked ? undefined : secondaryColor }}
                    >
                        {studentName}
                    </h1>

                    <p className="text-lg text-[#6b6560] dark:text-[#9a948c]">
                        {t('completed')} <span className="font-medium text-[#3a3632] dark:text-[#d4cfc8]">{courseTitle}</span>
                    </p>
                </header>

                {/* Main credential card */}
                <div className="relative bg-white dark:bg-[#222220] rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04),0_16px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15),0_16px_40px_rgba(0,0,0,0.2)]">

                    {/* Top accent — thin gradient line */}
                    <div
                        className="h-[3px] w-full"
                        style={{
                            background: `linear-gradient(90deg, transparent 0%, ${primaryColor} 20%, ${primaryColor} 80%, transparent 100%)`,
                        }}
                    />

                    <div className="p-8 sm:p-10">
                        {/* Issuer info */}
                        <div className="flex items-center gap-4 mb-10">
                            {logoUrl ? (
                                <img
                                    src={logoUrl}
                                    alt={issuerName}
                                    className="h-11 w-11 rounded-lg object-contain"
                                />
                            ) : (
                                <div
                                    className="h-11 w-11 rounded-lg flex items-center justify-center text-white font-semibold text-sm"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    {issuerName.substring(0, 2).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="font-medium text-[#3a3632] dark:text-[#d4cfc8]">{issuerName}</p>
                                <p className="text-sm text-[#8a8578] dark:text-[#7a756e]">{t('issuingOrganization')}</p>
                            </div>
                        </div>

                        {/* Verification details */}
                        <div className="space-y-6">
                            <VerifyRow label={t('credential')} value={t('certificateOfCompletion')} />
                            <VerifyRow label={t('issued')} value={issuedDate} />
                            {expiresAt && <VerifyRow label={t('expires')} value={expiresAt} />}
                            {score != null && (
                                <VerifyRow label={t('score')} value={`${Math.round(score)}%`} />
                            )}
                            {sigName && (
                                <VerifyRow
                                    label={t('signedBy')}
                                    value={sigTitle ? `${sigName}, ${sigTitle}` : sigName}
                                />
                            )}

                            {/* Verification code — monospaced, with visual emphasis */}
                            <div className="pt-6 border-t border-[#eae6e1] dark:border-[#333330]">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-medium text-[#8a8578] dark:text-[#7a756e] uppercase tracking-wider mb-1.5">
                                            {t('verificationId')}
                                        </p>
                                        <p className="font-mono text-sm text-[#3a3632] dark:text-[#d4cfc8] tracking-wider">
                                            {certificate.verification_code}
                                        </p>
                                    </div>
                                    <div className="mt-4">
                                        {isRevoked ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/30">
                                                <IconX size={14} className="text-red-500" />
                                                <span className="text-xs font-medium text-red-600 dark:text-red-400">{t('revoked')}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                                                <IconCheck size={14} className="text-emerald-500" />
                                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{t('valid')}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <a
                        href={certificate.pdf_url || `/api/certificates/view/${certificate.verification_code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                    >
                        <Button
                            className="w-full h-11 font-medium gap-2 text-white border-0"
                            style={{ backgroundColor: primaryColor }}
                        >
                            <IconDownload size={16} />
                            {certificate.pdf_url ? t('downloadPdf') : t('viewCertificate')}
                        </Button>
                    </a>
                    {courseStillExists && (
                        <Link
                            href={`/dashboard/student/courses/${certificate.courses!.course_id}`}
                            className="flex-1"
                        >
                            <Button variant="outline" className="w-full h-11 font-medium gap-2 border-[#ddd8d2] dark:border-[#3a3836] text-[#3a3632] dark:text-[#d4cfc8] hover:bg-[#f0ece7] dark:hover:bg-[#2a2927]">
                                <IconExternalLink size={16} />
                                {t('viewCourse')}
                            </Button>
                        </Link>
                    )}
                </div>

                {/* Footer */}
                <footer className="mt-16 text-center">
                    <p className="text-xs text-[#b0aaa2] dark:text-[#5a5650]">
                        {t('footerText', { date: issuedDate })}
                    </p>
                </footer>
            </div>
        </div>
    )
}

function VerifyRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-[#8a8578] dark:text-[#7a756e] shrink-0">{label}</span>
            <span className="text-sm font-medium text-[#3a3632] dark:text-[#d4cfc8] text-right">{value}</span>
        </div>
    )
}
