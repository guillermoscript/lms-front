/**
 * PDF Certificate Generator
 * Generates PDF certificates using @react-pdf/renderer
 */

import React from 'react';
import {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
    Font,
    pdf,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';

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
    designConfig?: DesignConfig;
}

export interface DesignConfig {
    backgroundColor?: string;
    primaryColor?: string;
    fontFamily?: string;
    borderStyle?: string;
    layout?: string;
    includeQRCode?: boolean;
    includeVerificationUrl?: boolean;
    customText?: {
        header?: string;
        footer?: string;
    };
}

// =====================================================
// Styles
// =====================================================

const createStyles = (config?: DesignConfig) => StyleSheet.create({
    page: {
        backgroundColor: config?.backgroundColor || '#ffffff',
        padding: 40,
        fontFamily: 'Helvetica',
    },
    border: {
        border: `3px solid ${config?.primaryColor || '#1a1a2e'}`,
        padding: 20,
        height: '100%',
    },
    innerBorder: {
        border: `1px solid ${config?.primaryColor || '#b8860b'}`,
        padding: 30,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    seal: {
        width: 60,
        height: 60,
        border: `2px solid ${config?.primaryColor || '#b8860b'}`,
        borderRadius: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    sealText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: config?.primaryColor || '#b8860b',
    },
    headerText: {
        fontSize: 10,
        letterSpacing: 4,
        textTransform: 'uppercase',
        color: config?.primaryColor || '#b8860b',
        marginBottom: 5,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#1a1a2e',
        marginBottom: 8,
        fontFamily: 'Helvetica-Bold',
    },
    subtitle: {
        fontSize: 12,
        color: '#666',
        marginBottom: 20,
    },
    awardedTo: {
        fontSize: 10,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color: '#999',
        marginBottom: 8,
    },
    studentName: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1a1a2e',
        marginBottom: 15,
        paddingBottom: 10,
        borderBottom: `2px solid ${config?.primaryColor || '#b8860b'}`,
        fontFamily: 'Helvetica-Bold',
    },
    description: {
        fontSize: 12,
        color: '#555',
        marginBottom: 8,
        textAlign: 'center',
    },
    courseTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a1a2e',
        marginBottom: 20,
        fontFamily: 'Helvetica-Bold',
    },
    footer: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: 500,
        marginTop: 'auto',
        paddingTop: 20,
    },
    footerItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    footerLine: {
        width: 120,
        height: 1,
        backgroundColor: '#ccc',
        marginBottom: 5,
    },
    footerLabel: {
        fontSize: 9,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: '#999',
    },
    footerValue: {
        fontSize: 11,
        color: '#333',
        marginBottom: 5,
    },
    qrCode: {
        width: 80,
        height: 80,
        marginTop: 10,
    },
    verificationCode: {
        position: 'absolute',
        bottom: 30,
        right: 40,
        fontSize: 8,
        color: '#bbb',
    },
    signature: {
        width: 100,
        height: 40,
        marginBottom: 5,
    },
});

// =====================================================
// PDF Document Component
// =====================================================

const CertificateDocument: React.FC<{ data: CertificatePDFData }> = ({ data }) => {
    const styles = createStyles(data.designConfig);

    const formattedDate = data.completionDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>
                <View style={styles.border}>
                    <View style={styles.innerBorder}>
                        <View style={styles.seal}>
                            {data.issuerLogo ? (
                                <Image src={data.issuerLogo} style={{ width: 50, height: 50 }} />
                            ) : (
                                <Text style={styles.sealText}>LMS</Text>
                            )}
                        </View>

                        <Text style={styles.headerText}>
                            {data.designConfig?.customText?.header || data.issuerName}
                        </Text>
                        <Text style={styles.title}>Certificate of Completion</Text>
                        <Text style={styles.subtitle}>This is to certify that</Text>

                        <Text style={styles.awardedTo}>Awarded To</Text>
                        <Text style={styles.studentName}>{data.studentName}</Text>

                        <Text style={styles.description}>
                            has successfully completed all requirements for the course
                        </Text>
                        <Text style={styles.courseTitle}>{data.courseTitle}</Text>

                        {data.score !== undefined && (
                            <Text style={styles.description}>
                                Final Score: {Math.round(data.score)}%
                            </Text>
                        )}

                        <View style={styles.footer}>
                            <View style={styles.footerItem}>
                                <Text style={styles.footerValue}>{formattedDate}</Text>
                                <View style={styles.footerLine} />
                                <Text style={styles.footerLabel}>Date</Text>
                            </View>

                            <View style={styles.footerItem}>
                                {data.signatureImage ? (
                                    <Image src={data.signatureImage} style={styles.signature} />
                                ) : (
                                    <Text style={styles.footerValue}>{data.issuerName}</Text>
                                )}
                                <View style={styles.footerLine} />
                                <Text style={styles.footerLabel}>
                                    {data.signatureTitle || 'Issued By'}
                                </Text>
                                {data.signatureName && (
                                    <Text style={{ fontSize: 9, color: '#666' }}>
                                        {data.signatureName}
                                    </Text>
                                )}
                            </View>

                            {data.designConfig?.includeQRCode !== false && (
                                <View style={styles.footerItem}>
                                    <Image src={data.verificationUrl} style={styles.qrCode} />
                                    <Text style={styles.footerLabel}>Verify</Text>
                                </View>
                            )}
                        </View>

                        <Text style={styles.verificationCode}>
                            {data.verificationCode}
                        </Text>

                        {data.designConfig?.customText?.footer && (
                            <Text style={{ fontSize: 8, color: '#999', marginTop: 10, textAlign: 'center' }}>
                                {data.designConfig.customText.footer}
                            </Text>
                        )}
                    </View>
                </View>
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
                dark: '#000000',
                light: '#ffffff',
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

        // Update data with QR code
        const pdfData = {
            ...data,
            verificationUrl: qrCodeDataUrl, // Replace URL with QR code data URL
        };

        // Generate PDF
        const doc = <CertificateDocument data={ pdfData } />;
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
    supabaseClient: any
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
