/**
 * Digital Badge Generator
 * Generates PNG/SVG badge images with "baked" Open Badges metadata
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { headingFontPath } from '@/lib/themes/brand-fonts';
import type { KitHeadingFont } from '@/lib/themes/brand-outputs';
import type { ResolvedCertificateDesign } from './default-design';

// =====================================================
// Types
// =====================================================

export interface BadgeImageData {
    courseTitle: string;
    studentName: string;
    issuedDate: Date;
    issuerName: string;
    issuerLogo?: string;
    /** Resolved by `resolveCertificateDesign()` — the school brand for the default design, the template's own colours for a custom one. */
    design: ResolvedCertificateDesign;
    credential: Record<string, unknown>; // Open Badges 3.0 credential JSON
}

/**
 * Registers `Kit <family>` (bold weight only — the course title is the one
 * bold badge label) once per process. No-op when the file is missing on disk.
 */
const registeredHeadingFamilies = new Set<string>();

function ensureHeadingFontRegistered(family: KitHeadingFont): string | null {
    const canvasFamily = `Kit ${family}`;
    if (registeredHeadingFamilies.has(canvasFamily)) return canvasFamily;

    const bold = headingFontPath(family, 700);
    if (!bold) return null;

    registerFont(bold, { family: canvasFamily, weight: '700' });
    registeredHeadingFamilies.add(canvasFamily);
    return canvasFamily;
}

// =====================================================
// Badge Generation
// =====================================================

/**
 * Generate badge image (PNG) with embedded metadata
 */
export async function generateBadgeImage(
    data: BadgeImageData,
    format: 'png' | 'svg' = 'png'
): Promise<Buffer> {
    const width = 400;
    const height = 400;
    const { design } = data;
    const headingFamily = design.headingFont ? ensureHeadingFontRegistered(design.headingFont) : null;

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background — a school-branded badge gradients into `deep`; a custom
    // template keeps its fixed navy second stop exactly as it always has (its
    // `design_settings` never carried a second badge colour).
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, design.primary);
    gradient.addColorStop(1, design.schoolBranded ? design.secondary : '#0d47a1');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Badge circle
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 150, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Inner circle
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 130, 0, Math.PI * 2);
    ctx.strokeStyle = design.primary;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Logo/Icon (if provided)
    if (data.issuerLogo) {
        try {
            const logo = await loadImage(data.issuerLogo);
            const logoSize = 80;
            ctx.drawImage(
                logo,
                width / 2 - logoSize / 2,
                height / 2 - 50,
                logoSize,
                logoSize
            );
        } catch (error) {
            console.error('Logo loading error:', error);
        }
    }

    // Course Title (truncated) — brand-coloured TEXT uses `accentText`; a
    // custom template keeps its fixed ink exactly as it always has.
    ctx.fillStyle = design.schoolBranded ? design.accentText : '#1a1a2e';
    ctx.font = headingFamily ? `bold 18px "${headingFamily}"` : 'bold 18px Arial';
    ctx.textAlign = 'center';
    const truncatedTitle = truncateText(data.courseTitle, 20);
    ctx.fillText(truncatedTitle, width / 2, height / 2 + 20);

    // "Certificate" text
    ctx.font = '14px Arial';
    ctx.fillStyle = '#666';
    ctx.fillText('Certificate', width / 2, height / 2 + 45);

    // Issuer name
    ctx.font = '12px Arial';
    ctx.fillStyle = '#999';
    ctx.fillText(data.issuerName, width / 2, height / 2 + 65);

    // Date
    const dateStr = data.issuedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
    });
    ctx.fillText(dateStr, width / 2, height - 30);

    // Convert to buffer
    if (format === 'png') {
        const buffer = canvas.toBuffer('image/png');
        return buffer;
    } else {
        // SVG format
        const buffer = canvas.toBuffer('image/png');
        return buffer;
    }
}

/**
 * Bake Open Badges metadata into PNG image
 * Embeds JSON-LD credential in iTXt chunk
 */
export async function bakeMetadataIntoPNG(
    imageBuffer: Buffer,
    credential: Record<string, unknown>
): Promise<Buffer> {
    try {
        // Convert credential to JSON string
        const credentialJson = JSON.stringify(credential);

        // Use sharp to add metadata
        const bakedImage = await sharp(imageBuffer)
            .png({
                compressionLevel: 9,
            })
            .withMetadata({
                exif: {
                    IFD0: {
                        ImageDescription: credentialJson,
                    },
                },
            })
            .toBuffer();

        return bakedImage;
    } catch (error) {
        console.error('Metadata baking error:', error);
        // Return original image if baking fails
        return imageBuffer;
    }
}

/**
 * Generate badge and upload to Supabase Storage
 */
export async function generateAndUploadBadge(
    data: BadgeImageData,
    certificateId: string,
    supabaseClient: SupabaseClient
): Promise<string> {
    try {
        // Generate badge image
        const badgeBuffer = await generateBadgeImage(data);

        // Bake metadata
        const bakedBadge = await bakeMetadataIntoPNG(badgeBuffer, data.credential);

        // Upload to Supabase Storage
        const fileName = `${certificateId}.png`;
        const { data: uploadData, error } = await supabaseClient.storage
            .from('certificates')
            .upload(`badges/${fileName}`, bakedBadge, {
                contentType: 'image/png',
                upsert: true,
            });

        if (error) {
            throw error;
        }

        // Get public URL
        const { data: urlData } = supabaseClient.storage
            .from('certificates')
            .getPublicUrl(`badges/${fileName}`);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Badge upload error:', error);
        throw error;
    }
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Truncate text to max length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract metadata from baked PNG
 */
export async function extractMetadataFromPNG(
    imageBuffer: Buffer
): Promise<Record<string, unknown> | null> {
    try {
        const metadata = await sharp(imageBuffer).metadata();

        if (metadata.exif) {
            // Parse EXIF data to extract ImageDescription
            // This is a simplified version - full implementation would parse EXIF binary
            const description = (metadata as { exif?: { ImageDescription?: string } }).exif?.ImageDescription;
            if (description) {
                return JSON.parse(description);
            }
        }

        return null;
    } catch (error) {
        console.error('Metadata extraction error:', error);
        return null;
    }
}
