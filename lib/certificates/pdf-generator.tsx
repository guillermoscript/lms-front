/**
 * PDF Certificate Generator
 * Generates PDF certificates using @react-pdf/renderer
 * Design: Luxury credential aesthetic matching the HTML certificate view
 */

import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
    Font,
    pdf,
    Svg,
    Ellipse,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { headingFontPath } from '@/lib/themes/brand-fonts';
import type { KitHeadingFont } from '@/lib/themes/brand-outputs';
import type { ResolvedCertificateDesign } from './default-design';

// =====================================================
// Types
// =====================================================

export interface CertificatePDFData {
    studentName: string;
    courseTitle: string;
    completionDate: Date;
    issuedDate: Date;
    verificationCode: string;
    verificationUrl: string;
    issuerName: string;
    issuerLogo?: string;
    signatureName?: string;
    signatureTitle?: string;
    signatureImage?: string;
    score?: number;
    /** Resolved by `resolveCertificateDesign()` — the school brand for the default design, the template's own colours for a custom one. */
    design: ResolvedCertificateDesign;
    /** From the template's `design_settings.show_qr_code` — defaults to true. */
    showQrCode?: boolean;
    logoUrl?: string;
}

/**
 * Registers `Kit <family>` once per process per family, so repeated PDF
 * generations don't re-register (and don't re-read the font files). No-op
 * when either weight's file is missing on disk.
 */
const registeredHeadingFamilies = new Set<string>();


function ensureHeadingFontRegistered(family: KitHeadingFont): string | null {
    const pdfFamily = `Kit ${family}`;
    if (registeredHeadingFamilies.has(pdfFamily)) return pdfFamily;

    const regular = headingFontPath(family, 400);
    const bold = headingFontPath(family, 700);
    if (!regular || !bold) return null;

    // The kit families ship no italic file — only weight varies here.
    Font.register({
        family: pdfFamily,
        fonts: [
            { src: regular, fontWeight: 400 },
            { src: bold, fontWeight: 700 },
        ],
    });
    registeredHeadingFamilies.add(pdfFamily);
    return pdfFamily;
}

// =====================================================
// Guilloche Pattern Component (SVG)
// =====================================================

const GuillocheSVG: React.FC<{ color: string; width: number; height: number }> = ({ color, width, height }) => {
    const cx = width / 2;
    const cy = height / 2;
    const ellipses = [];
    for (let i = 0; i < 24; i++) {
        const angle = (i * 15) * Math.PI / 180;
        const r1 = 180 + Math.sin(angle * 3) * 50;
        const r2 = 140 + Math.cos(angle * 5) * 35;
        ellipses.push(
            <Ellipse
                key={i}
                cx={cx}
                cy={cy}
                rx={r1}
                ry={r2}
                fill="none"
                stroke={color}
                strokeWidth={0.3}
                opacity={0.04}
                transform={`rotate(${i * 15} ${cx} ${cy})`}
            />
        );
    }
    return (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', top: 0, left: 0 }}>
            {ellipses}
        </Svg>
    );
};

// =====================================================
// Styles
// =====================================================

// Exported so a unit test can assert a custom template's colours actually
// reach the stylesheet without rendering a full PDF (issue #765 — this file
// used to ignore a custom template's primary_color and always draw green).
export const createStyles = (design: ResolvedCertificateDesign, headingFamily: string | null) => {
    // Decorative strokes and fills. Before #765 a custom template's PDF ignored
    // its own primary_color (camelCase/snake_case mismatch) and always drew
    // green; the resolver now hands every renderer the template's real colour.
    const primary = design.primary;
    // Brand-coloured TEXT (never the raw `primary`/`secondary` swatch — see
    // `resolveCertificateDesign`): a school-branded certificate reads every
    // label and headline in the one AA-safe `accentText`; a custom template
    // keeps its own two-tone split (primary for small caps,
    // secondary for the headline ink) exactly as it always has.
    const smallText = design.schoolBranded ? design.accentText : primary;
    const bigText = design.schoolBranded ? design.accentText : design.secondary;
    // The kit heading families ship no italic file — only the platform's
    // built-in Helvetica gets the italic title treatment.
    const titleFontFamily = headingFamily ?? 'Helvetica';
    const titleFontStyle = headingFamily ? undefined : ('italic' as const);
    const headingBoldFamily = headingFamily ?? 'Helvetica-Bold';
    const headingBoldWeight = headingFamily ? 700 : undefined;

    return StyleSheet.create({
        page: {
            backgroundColor: '#fffef9',
            fontFamily: 'Helvetica',
            position: 'relative',
        },
        // Outer frame — fine double line
        frameOuter: {
            position: 'absolute',
            top: 18,
            left: 18,
            right: 18,
            bottom: 18,
            borderWidth: 0.75,
            borderColor: `${primary}40`,
        },
        frameInner: {
            position: 'absolute',
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            borderWidth: 0.5,
            borderColor: `${primary}20`,
        },
        // Top accent line
        topRule: {
            position: 'absolute',
            top: 10,
            left: '35%',
            width: '30%',
            height: 1.5,
            backgroundColor: primary,
            opacity: 0.5,
        },
        bottomRule: {
            position: 'absolute',
            bottom: 10,
            left: '35%',
            width: '30%',
            height: 1,
            backgroundColor: primary,
            opacity: 0.3,
        },
        // Content container
        content: {
            position: 'absolute',
            top: 48,
            left: 60,
            right: 60,
            bottom: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
        },
        // Organization seal
        sealContainer: {
            marginBottom: 14,
        },
        sealRing: {
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 1.5,
            borderColor: primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        },
        sealMonogram: {
            fontSize: 16,
            fontFamily: 'Helvetica-Bold',
            color: smallText,
            letterSpacing: 1.5,
        },
        logoImage: {
            height: 52,
            maxWidth: 140,
            objectFit: 'contain',
        },
        // Issuer name
        issuerName: {
            fontSize: 9,
            fontFamily: 'Helvetica',
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: smallText,
            marginBottom: 8,
        },
        // Title
        title: {
            fontSize: 36,
            fontFamily: titleFontFamily,
            fontStyle: titleFontStyle,
            color: bigText,
            marginBottom: 4,
        },
        // Decorative rule under title
        titleRule: {
            width: 200,
            height: 0.75,
            backgroundColor: `${primary}50`,
            marginTop: 8,
            marginBottom: 16,
        },
        // Preamble
        preamble: {
            fontSize: 10,
            color: '#8a8578',
            letterSpacing: 0.3,
            marginBottom: 6,
        },
        // Student name
        studentName: {
            fontSize: 32,
            fontFamily: headingBoldFamily,
            fontWeight: headingBoldWeight,
            color: bigText,
            marginBottom: 6,
        },
        // Flourish decoration
        flourish: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
        },
        flourishLine: {
            width: 60,
            height: 0.5,
            backgroundColor: primary,
        },
        flourishDiamond: {
            width: 5,
            height: 5,
            backgroundColor: primary,
            transform: 'rotate(45deg)',
        },
        // Description
        description: {
            fontSize: 10,
            color: '#6b6560',
            marginBottom: 5,
        },
        // Course name
        courseName: {
            fontSize: 18,
            fontFamily: headingBoldFamily,
            fontWeight: headingBoldWeight,
            color: bigText,
            marginBottom: 14,
            textAlign: 'center',
        },
        // Score badge
        scoreBadge: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingVertical: 6,
            paddingHorizontal: 20,
            borderWidth: 0.75,
            borderColor: `${primary}30`,
            marginBottom: 14,
        },
        scoreLabel: {
            fontSize: 7,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            color: '#8a8578',
        },
        scoreValue: {
            fontSize: 20,
            fontFamily: 'Helvetica-Bold',
            color: bigText,
        },
        // Footer
        footer: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            width: '100%',
            maxWidth: 420,
            marginTop: 'auto',
            paddingTop: 10,
        },
        footerCol: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 120,
        },
        signatureImage: {
            height: 28,
            maxWidth: 110,
            objectFit: 'contain',
            marginBottom: 4,
        },
        footerName: {
            fontSize: 10,
            color: '#3a3632',
            marginBottom: 4,
        },
        footerRule: {
            width: 110,
            height: 0.5,
            backgroundColor: '#c5bfb6',
            marginBottom: 4,
        },
        footerLabel: {
            fontSize: 7,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#9a948c',
        },
        // QR code
        qrCol: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        },
        qrImage: {
            width: 60,
            height: 60,
            marginBottom: 3,
        },
        qrLabel: {
            fontSize: 6,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: '#9a948c',
        },
        // Certificate ID watermark
        certId: {
            position: 'absolute',
            bottom: 22,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 7,
            color: '#c5bfb6',
            letterSpacing: 1.5,
        },
    });
};

// =====================================================
// PDF Document Component
// =====================================================

const CertificateDocument: React.FC<{ data: CertificatePDFData; qrCodeDataUrl?: string }> = ({ data, qrCodeDataUrl }) => {
    const headingFamily = data.design.headingFont ? ensureHeadingFontRegistered(data.design.headingFont) : null;
    const styles = createStyles(data.design, headingFamily);
    const primary = data.design.primary;

    const formattedDate = data.completionDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const signerName = data.signatureName || data.issuerName;
    const signerTitle = data.signatureTitle || 'Official Issuer';
    const showQr = data.showQrCode !== false;
    const issuerMonogram = data.issuerName.substring(0, 3).toUpperCase();

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>
                {/* Guilloche watermark pattern */}
                <GuillocheSVG color={primary} width={842} height={595} />

                {/* Frame borders */}
                <View style={styles.frameOuter} />
                <View style={styles.frameInner} />

                {/* Top/bottom accent lines */}
                <View style={styles.topRule} />
                <View style={styles.bottomRule} />

                {/* Main content */}
                <View style={styles.content}>
                    {/* Organization seal / logo */}
                    <View style={styles.sealContainer}>
                        {data.issuerLogo || data.logoUrl ? (
                            <Image src={data.issuerLogo || data.logoUrl || ''} style={styles.logoImage} />
                        ) : (
                            <View style={styles.sealRing}>
                                <Text style={styles.sealMonogram}>{issuerMonogram}</Text>
                            </View>
                        )}
                    </View>

                    {/* Issuer name */}
                    <Text style={styles.issuerName}>{data.issuerName}</Text>

                    {/* Title */}
                    <Text style={styles.title}>Certificate of Completion</Text>
                    <View style={styles.titleRule} />

                    {/* Preamble */}
                    <Text style={styles.preamble}>This is to certify that</Text>

                    {/* Student name */}
                    <Text style={styles.studentName}>{data.studentName}</Text>

                    {/* Flourish */}
                    <View style={styles.flourish}>
                        <View style={styles.flourishLine} />
                        <View style={styles.flourishDiamond} />
                        <View style={styles.flourishLine} />
                    </View>

                    {/* Description */}
                    <Text style={styles.description}>has successfully completed all requirements for the course</Text>

                    {/* Course name */}
                    <Text style={styles.courseName}>{data.courseTitle}</Text>

                    {/* Score badge */}
                    {data.score !== undefined && data.score > 0 && (
                        <View style={styles.scoreBadge}>
                            <Text style={styles.scoreLabel}>Achievement Score</Text>
                            <Text style={styles.scoreValue}>{Math.round(data.score)}%</Text>
                        </View>
                    )}

                    {/* Footer */}
                    <View style={styles.footer}>
                        {/* Signature column */}
                        <View style={styles.footerCol}>
                            {data.signatureImage && (
                                <Image src={data.signatureImage} style={styles.signatureImage} />
                            )}
                            <Text style={styles.footerName}>{signerName}</Text>
                            <View style={styles.footerRule} />
                            <Text style={styles.footerLabel}>{signerTitle}</Text>
                        </View>

                        {/* QR code column (optional) */}
                        {showQr && qrCodeDataUrl && (
                            <View style={styles.qrCol}>
                                <Image src={qrCodeDataUrl} style={styles.qrImage} />
                                <Text style={styles.qrLabel}>Verify</Text>
                            </View>
                        )}

                        {/* Date column */}
                        <View style={styles.footerCol}>
                            <Text style={styles.footerName}>{formattedDate}</Text>
                            <View style={styles.footerRule} />
                            <Text style={styles.footerLabel}>Date Issued</Text>
                        </View>
                    </View>
                </View>

                {/* Certificate number */}
                <Text style={styles.certId}>{data.verificationCode}</Text>
            </Page>
        </Document>
    );
};

// =====================================================
// PDF Generation Functions
// =====================================================

/**
 * Generate QR code as data URL
 */
async function generateQRCode(url: string): Promise<string> {
    try {
        const qrDataUrl = await QRCode.toDataURL(url, {
            width: 200,
            margin: 1,
            color: {
                dark: '#3a3632',
                light: '#fffef9',
            },
        });
        return qrDataUrl;
    } catch (error) {
        console.error('QR code generation error:', error);
        throw error;
    }
}

/**
 * Generate PDF certificate
 * Returns Buffer containing PDF data
 */
export async function generateCertificatePDF(
    data: CertificatePDFData
): Promise<Buffer> {
    try {
        // Generate QR code
        const qrCodeDataUrl = await generateQRCode(data.verificationUrl);

        // Generate PDF
        const doc = <CertificateDocument data={data} qrCodeDataUrl={qrCodeDataUrl} />;
        const asPdf = pdf(doc);
        const blob = await asPdf.toBlob();

        // Convert Blob to Buffer
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return buffer;
    } catch (error) {
        console.error('PDF generation error:', error);
        throw error;
    }
}

/**
 * Generate PDF and upload to Supabase Storage
 */
export async function generateAndUploadPDF(
    data: CertificatePDFData,
    certificateId: string,
    supabaseClient: SupabaseClient
): Promise<string> {
    try {
        // Generate PDF
        const pdfBuffer = await generateCertificatePDF(data);

        // Upload to Supabase Storage
        const fileName = `${certificateId}.pdf`;
        const { data: uploadData, error } = await supabaseClient.storage
            .from('certificates')
            .upload(`pdfs/${fileName}`, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true,
            });

        if (error) {
            throw error;
        }

        // Get public URL
        const { data: urlData } = supabaseClient.storage
            .from('certificates')
            .getPublicUrl(`pdfs/${fileName}`);

        return urlData.publicUrl;
    } catch (error) {
        console.error('PDF upload error:', error);
        throw error;
    }
}
