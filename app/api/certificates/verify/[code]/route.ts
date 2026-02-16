/**
 * Public Certificate Verification API
 * GET /api/certificates/verify/[code]
 * No authentication required - public endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Rate limiting (simple in-memory implementation)
const verificationAttempts = new Map<string, number[]>();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const attempts = verificationAttempts.get(ip) || [];

    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(time => now - time < RATE_WINDOW);

    if (recentAttempts.length >= RATE_LIMIT) {
        return false;
    }

    recentAttempts.push(now);
    verificationAttempts.set(ip, recentAttempts);
    return true;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    const startTime = Date.now();

    try {
        // Get IP address for rate limiting
        const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown';

        // Check rate limit
        if (!checkRateLimit(ip)) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429 }
            );
        }

        const { code } = await params;

        // Create Supabase client (no auth required for public verification)
        const supabase = await createClient();

        // Fetch certificate by verification code
        const { data: certificate, error } = await supabase
            .from('certificates')
            .select(`
        certificate_id,
        user_id,
        course_id,
        verification_code,
        credential_json,
        issued_at,
        expires_at,
        revoked_at,
        revoke_reason,
        badge_image_url,
        completion_data,
        course:courses(title, description),
        user:profiles(full_name, username)
      `)
            .eq('verification_code', code)
            .single();

        if (error || !certificate) {
            // Log failed verification
            await logVerification(
                supabase,
                null,
                code,
                'not_found',
                ip,
                request,
                Date.now() - startTime
            );

            return NextResponse.json(
                {
                    found: false,
                    error: 'Certificate not found',
                },
                { status: 404 }
            );
        }

        // Check if revoked
        if (certificate.revoked_at) {
            await logVerification(
                supabase,
                certificate.certificate_id,
                code,
                'revoked',
                ip,
                request,
                Date.now() - startTime
            );

            return NextResponse.json({
                found: true,
                valid: false,
                revoked: true,
                revoke_reason: certificate.revoke_reason,
                revoked_at: certificate.revoked_at,
            });
        }

        // Check if expired
        const isExpired = certificate.expires_at &&
            new Date(certificate.expires_at) < new Date();

        if (isExpired) {
            await logVerification(
                supabase,
                certificate.certificate_id,
                code,
                'expired',
                ip,
                request,
                Date.now() - startTime
            );

            return NextResponse.json({
                found: true,
                valid: false,
                expired: true,
                expires_at: certificate.expires_at,
            });
        }

        // Verify cryptographic signature (optional - can be slow)
        // const isSignatureValid = await verifyCertificateSignature(certificate);

        // Increment view count
        await supabase
            .from('certificates')
            .update({ view_count: (certificate as any).view_count + 1 })
            .eq('certificate_id', certificate.certificate_id);

        // Log successful verification
        await logVerification(
            supabase,
            certificate.certificate_id,
            code,
            'valid',
            ip,
            request,
            Date.now() - startTime
        );

        // Return public certificate data
        return NextResponse.json({
            found: true,
            valid: true,
            certificate: {
                id: certificate.certificate_id,
                verification_code: certificate.verification_code,
                issued_at: certificate.issued_at,
                expires_at: certificate.expires_at,
                user_name: (certificate.user as any)?.full_name || (certificate.user as any)?.username,
                course_name: (certificate.course as any)?.title,
                course_description: (certificate.course as any)?.description,
                badge_image_url: certificate.badge_image_url,
                credential: certificate.credential_json,
                completion_data: certificate.completion_data,
                issuer: {
                    name: process.env.CERTIFICATE_ISSUER_NAME || 'LMS Academy',
                    url: process.env.NEXT_PUBLIC_APP_URL,
                },
            },
        });
    } catch (error) {
        console.error('Verification error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Helper function to log verification attempts
async function logVerification(
    supabase: any,
    certificateId: string | null,
    verificationCode: string,
    status: string,
    ip: string,
    request: NextRequest,
    responseTime: number
) {
    try {
        await supabase.from('certificate_verification_log').insert({
            certificate_id: certificateId,
            verification_code: verificationCode,
            verification_status: status,
            ip_address: ip,
            user_agent: request.headers.get('user-agent'),
            referrer: request.headers.get('referer'),
            response_time_ms: responseTime,
        });
    } catch (error) {
        console.error('Failed to log verification:', error);
    }
}
