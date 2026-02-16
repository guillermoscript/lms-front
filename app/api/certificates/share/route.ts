/**
 * Certificate Sharing API
 * POST /api/certificates/share
 * Logs certificate sharing activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { certificateId, platform, shareUrl } = body;

        if (!certificateId || !platform) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Verify certificate belongs to user
        const { data: certificate, error: certError } = await supabase
            .from('certificates')
            .select('certificate_id, user_id, share_count')
            .eq('certificate_id', certificateId)
            .eq('user_id', user.id)
            .single();

        if (certError || !certificate) {
            return NextResponse.json(
                { error: 'Certificate not found or access denied' },
                { status: 404 }
            );
        }

        // Get IP address
        const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            null;

        // Log share
        const { error: shareError } = await supabase
            .from('certificate_shares')
            .insert({
                certificate_id: certificateId,
                platform,
                share_url: shareUrl,
                ip_address: ip,
                user_agent: request.headers.get('user-agent'),
            });

        if (shareError) {
            throw shareError;
        }

        // Increment share count
        await supabase
            .from('certificates')
            .update({ share_count: certificate.share_count + 1 })
            .eq('certificate_id', certificateId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Share logging error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
