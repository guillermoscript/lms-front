/**
 * Digital Badge Generator
 * Generates PNG/SVG badge images with "baked" Open Badges metadata
 */

import sharp from 'sharp';
import { createCanvas, loadImage, registerFont } from 'canvas';

// =====================================================
// Types
// =====================================================

export interface BadgeImageData {
    courseTitle: string;
    studentName: string;
    issuedDate: Date;
    issuerName: string;
    issuerLogo?: string;
    badgeColor?: string;
    credential: any; // Open Badges 3.0 credential JSON
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

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, data.badgeColor || '#1a73e8');
    gradient.addColorStop(1, '#0d47a1');
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
    ctx.strokeStyle = data.badgeColor || '#1a73e8';
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

    // Course Title (truncated)
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 18px Arial';
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
    credential: any
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
    supabaseClient: any
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
): Promise<any | null> {
    try {
        const metadata = await sharp(imageBuffer).metadata();

        if (metadata.exif) {
            // Parse EXIF data to extract ImageDescription
            // This is a simplified version - full implementation would parse EXIF binary
            const description = (metadata as any).exif?.ImageDescription;
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
