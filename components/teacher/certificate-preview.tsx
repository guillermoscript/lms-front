'use client'

import { IconAward, IconQrcode, IconShieldCheck } from '@tabler/icons-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@/lib/format-date'
import type { BrandOutputs } from '@/lib/themes/brand-outputs'
import { CERTIFICATE_PAPER_INK, resolveCertificateDesign } from '@/lib/certificates/default-design'

interface CertificatePreviewProps {
    templateName: string
    issuerName: string
    designSettings: {
        primary_color: string
        secondary_color: string
        show_qr_code: boolean
    }
    /** The school's brand (issue #765) — drives the preview when `designSettings` is still the untouched default. */
    brand: BrandOutputs
    signatureName?: string
    signatureTitle?: string
    signatureImageUrl?: string
    logoUrl?: string
}

/** Sample date shown in the template preview — fixed so server and client agree. */
const SAMPLE_CERTIFICATE_DATE = new Date('2026-06-15T12:00:00.000Z')

export function CertificatePreview({
    templateName,
    issuerName,
    designSettings,
    brand,
    signatureName,
    signatureTitle,
    signatureImageUrl,
    logoUrl
}: CertificatePreviewProps) {
    const t = useTranslations('dashboard.teacher.manageCourse.certificates.templates')
    const locale = useLocale()

    const mockStudentName = "Jane Doe"
    // A fixed sample date, not `new Date()`: this preview is server-rendered and
    // then hydrated, so "now" is evaluated twice. Pinning the locale and zone
    // narrows the gap, but a render straddling midnight still produces two
    // different strings and the React #418 this was meant to fix (#729).
    const mockDate = formatDate(SAMPLE_CERTIFICATE_DATE, locale, { dateStyle: 'long' })
    const mockCode = "VERIFY-MOCK-12345"

    // The design's own ink (#765): the school brand while the colours are
    // still the untouched default, or the teacher's own pick once customised
    // — same rule the PDF/HTML/badge renderers use. `smallText`/`bigText`
    // are brand-coloured TEXT (AA-safe); `primary`/`secondary` stay
    // decorative-only fills and are byte-identical to the raw colours for a
    // customised design.
    const design = resolveCertificateDesign(designSettings, brand)
    const smallText = design.schoolBranded ? design.accentText : design.primary
    const bigText = design.schoolBranded ? design.accentText : design.secondary
    const headingFontFamily = design.headingFont ? 'var(--font-heading)' : 'Georgia, serif'

    /*
     * A facsimile of the *printed* certificate, not a themed screen (T6-1,
     * docs/handoff/764-surface3/DECISIONS.md). The paper and neutral ink below
     * are the exact literals lib/certificate-generator.ts and
     * lib/certificates/pdf-generator.tsx print with — see
     * lib/certificates/default-design.ts's CERTIFICATE_PAPER_INK, the single
     * source those two renderers already share — and this one reads it too, via
     * `style`, because a hand-copied paper hex in a Tailwind arbitrary class is
     * exactly the drift that made the
     * preview disagree with the PDF in the first place (#774). That is not the
     * detector bypass T5-4 rejects: no literal moved into `style`, the literals
     * left the component entirely. The default design's ink is the school brand (#765); a customised
     * design keeps the teacher's own colours, unchanged. Both are content: the
     * school THEME must never recolour the printed paper itself, and a dark
     * surface would swallow a dark preset ink chosen against paper.
     */
    return (
        <div
            className="relative overflow-hidden rounded-xl border-2 shadow-xl"
            style={{ backgroundColor: CERTIFICATE_PAPER_INK.paper }}
        >
            {/* Decorative border */}
            <div className="absolute inset-2 border-2 border-dashed rounded-lg pointer-events-none opacity-[0.08]"
                style={{ borderColor: design.primary }}
            />

            {/* Top accent stripe */}
            <div className="h-2 w-full" style={{
                background: `linear-gradient(135deg, ${design.primary}, ${design.secondary})`
            }} />

            <div className="px-10 py-8 flex flex-col items-center text-center space-y-6">
                {/* Logo or Award icon */}
                {logoUrl ? (
                    <img
                        src={logoUrl}
                        alt="Logo"
                        className="h-16 w-16 object-contain"
                    />
                ) : (
                    <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{
                            background: `linear-gradient(135deg, ${design.primary}15, ${design.secondary}15)`,
                            color: smallText
                        }}
                    >
                        <IconAward size={36} stroke={1.5} />
                    </div>
                )}

                {/* Header text */}
                <div className="space-y-1.5">
                    <h3
                        className="text-[13px] font-bold uppercase tracking-[0.25em]"
                        style={{ color: smallText }}
                    >
                        {t('preview.header')}
                    </h3>
                    <p className="text-[11px] tracking-wide" style={{ color: CERTIFICATE_PAPER_INK.preamble }}>
                        {t('preview.certifyThat')}
                    </p>
                </div>

                {/* Student name — the generator paints this in the design's own
                    ink (.student-name → bigText), the same as the course title
                    below; it is never fixed neutral text. */}
                <div className="space-y-3 w-full">
                    <h2
                        className="text-3xl font-bold"
                        style={{ color: bigText, fontFamily: headingFontFamily }}
                    >
                        {mockStudentName}
                    </h2>
                    <div className="mx-auto w-32 h-px" style={{
                        background: `linear-gradient(90deg, transparent, ${design.primary}40, transparent)`
                    }} />
                    <p className="text-sm leading-relaxed" style={{ color: CERTIFICATE_PAPER_INK.description }}>
                        {t('preview.successfullyCompleted')}
                    </p>
                </div>

                {/* Course / Template name */}
                <h1
                    className="text-xl font-bold leading-tight px-4"
                    style={{ color: bigText, fontFamily: design.headingFont ? headingFontFamily : undefined }}
                >
                    {templateName || t('preview.courseTitle')}
                </h1>

                {/* Signatures row — keep: facsimile of the printed PDF's ink,
                    see lib/certificate-generator.ts .footer-rule/.footer-name/.footer-label */}
                <div className="w-full grid grid-cols-2 gap-8 pt-4 mt-2">
                    <div className="text-left space-y-1.5">
                        {signatureImageUrl ? (
                            <img
                                src={signatureImageUrl}
                                alt="Signature"
                                className="h-8 w-auto object-contain mb-1"
                            />
                        ) : null}
                        <div className="h-px w-full" style={{ backgroundColor: CERTIFICATE_PAPER_INK.footerRule }} />
                        <p className="font-semibold text-sm" style={{ color: CERTIFICATE_PAPER_INK.footerName }}>
                            {signatureName || issuerName || "LMS Academy"}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: CERTIFICATE_PAPER_INK.footerLabel }}>
                            {signatureTitle || t('preview.officialIssuer')}
                        </p>
                    </div>
                    <div className="text-right space-y-1.5">
                        <div className="h-px w-full" style={{ backgroundColor: CERTIFICATE_PAPER_INK.footerRule }} />
                        <p className="font-semibold text-sm" style={{ color: CERTIFICATE_PAPER_INK.footerName }}>{mockDate}</p>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: CERTIFICATE_PAPER_INK.footerLabel }}>{t('preview.issueDate')}</p>
                    </div>
                </div>

                {/* Footer */}
                <div
                    className="pt-4 w-full flex items-center justify-between border-t"
                    style={{ borderColor: CERTIFICATE_PAPER_INK.footerRule }}
                >
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: CERTIFICATE_PAPER_INK.footerLabel }}>
                        <IconShieldCheck size={14} />
                        <span className="uppercase tracking-wider font-medium">{t('preview.verified')}</span>
                    </div>

                    {designSettings.show_qr_code && (
                        <div className="flex items-center gap-2.5">
                            <div className="text-right">
                                <p className="text-[9px] font-mono" style={{ color: CERTIFICATE_PAPER_INK.certId }}>{mockCode}</p>
                            </div>
                            <div
                                className="p-1.5 rounded-md border"
                                style={{ color: smallText, borderColor: CERTIFICATE_PAPER_INK.footerRule }}
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
                style={{ backgroundColor: design.secondary }}
            />
            <div
                className="absolute bottom-0 left-0 w-24 h-24 -ml-12 -mb-12 rounded-full opacity-[0.06]"
                style={{ backgroundColor: design.primary }}
            />
        </div>
    )
}
