/**
 * Certificate Issuance Orchestration
 * Main function to issue certificates when students complete courses
 */

import { createClient } from '@/lib/supabase/server';
import { generateAchievementCredential, signCredential } from './open-badges';

// =====================================================
// Types
// =====================================================

export interface IssueCertificateResult {
    success: boolean;
    certificateId?: string;
    error?: string;
    reason?: string;
}

// =====================================================
// Main Issuance Function
// =====================================================

/**
 * Issue certificate for a student who completed a course
 */
export async function issueCertificate(
    userId: string,
    courseId: number
): Promise<IssueCertificateResult> {
    try {
        const supabase = await createClient();

        // 1. Check eligibility
        const { data: eligibility, error: eligibilityError } = await supabase
            .rpc('check_and_issue_certificate', {
                p_user_id: userId,
                p_course_id: courseId,
            });

        if (eligibilityError) {
            throw eligibilityError;
        }

        if (!eligibility.success) {
            return {
                success: false,
                reason: eligibility.reason,
            };
        }

        // 2. Get template and course info
        const { data: template, error: templateError } = await supabase
            .from('certificate_templates')
            .select('*, course:courses(*)')
            .eq('course_id', courseId)
            .eq('is_active', true)
            .single();

        if (templateError || !template) {
            return {
                success: false,
                error: 'No active certificate template found for this course',
            };
        }

        // 3. Get user profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError || !profile) {
            return {
                success: false,
                error: 'User profile not found',
            };
        }

        // 4. Get enrollment info
        const { data: enrollment } = await supabase
            .from('enrollments')
            .select('*')
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .single();

        // 5. Generate verification code
        const { data: verificationCode, error: codeError } = await supabase
            .rpc('generate_verification_code');

        if (codeError || !verificationCode) {
            throw new Error('Failed to generate verification code');
        }

        // 6. Get app configuration
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lms.example.com';
        const issuerName = process.env.CERTIFICATE_ISSUER_NAME || 'LMS Academy';

        // 7. Generate Open Badges 3.0 credential
        const issuedAt = new Date();
        const expiresAt = template.expiration_days
            ? new Date(Date.now() + template.expiration_days * 24 * 60 * 60 * 1000)
            : null;

        const credential = generateAchievementCredential(
            {
                certificateId: '', // Will be set after insert
                userId,
                userEmail: profile.email || '',
                userName: profile.full_name || profile.username || 'Student',
                courseId,
                courseTitle: template.course.title,
                courseDescription: template.course.description || '',
                completionData: eligibility.completion,
                verificationCode,
                issuedAt,
                expiresAt,
                template,
            },
            appUrl,
            issuerName
        );

        // 8. Get active issuer key
        const { data: issuerKey, error: keyError } = await supabase
            .from('issuer_keys')
            .select('*')
            .eq('is_active', true)
            .is('revoked_at', null)
            .single();

        if (keyError || !issuerKey) {
            return {
                success: false,
                error: 'No active issuer key found. Please contact administrator.',
            };
        }

        // 9. Decrypt private key and sign credential
        const encryptionKey = process.env.CERTIFICATE_ENCRYPTION_KEY;
        if (!encryptionKey) {
            throw new Error('CERTIFICATE_ENCRYPTION_KEY not configured');
        }

        const { decryptPrivateKey } = await import('./crypto');
        const privateKey = decryptPrivateKey(
            issuerKey.private_key_encrypted,
            encryptionKey
        );

        const signedCredential = await signCredential(
            credential,
            privateKey,
            issuerKey.key_url
        );

        // 10. Insert certificate record (to get ID)
        const { data: certificate, error: insertError } = await supabase
            .from('certificates')
            .insert({
                user_id: userId,
                course_id: courseId,
                template_id: template.template_id,
                enrollment_id: enrollment?.enrollment_id,
                verification_code: verificationCode,
                credential_json: signedCredential,
                completion_data: eligibility.completion,
                issued_at: issuedAt.toISOString(),
                expires_at: expiresAt?.toISOString(),
            })
            .select()
            .single();

        if (insertError || !certificate) {
            throw insertError || new Error('Failed to insert certificate');
        }

        // 11. Generate PDF certificate
        const verificationUrl = `${appUrl}/verify/${verificationCode}`;

        const { generateAndUploadPDF } = await import('./pdf-generator');
        const pdfUrl = await generateAndUploadPDF(
            {
                studentName: profile.full_name || profile.username || 'Student',
                courseTitle: template.course.title,
                completionDate: new Date(eligibility.completion.completedAt),
                issuedDate: issuedAt,
                verificationCode,
                verificationUrl,
                issuerName,
                issuerLogo: template.logo_url,
                signatureName: template.signature_name,
                signatureTitle: template.signature_title,
                signatureImage: template.signature_image_url,
                score: eligibility.completion.averageExamScore,
                designConfig: template.design_config,
            },
            certificate.certificate_id,
            supabase
        );

        // 12. Generate badge image
        const { generateAndUploadBadge } = await import('./badge-generator');
        const badgeUrl = await generateAndUploadBadge(
            {
                courseTitle: template.course.title,
                studentName: profile.full_name || profile.username || 'Student',
                issuedDate: issuedAt,
                issuerName,
                issuerLogo: template.logo_url,
                badgeColor: template.design_config?.primaryColor,
                credential: signedCredential,
            },
            certificate.certificate_id,
            supabase
        );

        // 13. Update certificate with file URLs
        const { error: updateError } = await supabase
            .from('certificates')
            .update({
                pdf_url: pdfUrl,
                badge_image_url: badgeUrl,
            })
            .eq('certificate_id', certificate.certificate_id);

        if (updateError) {
            console.error('Failed to update certificate URLs:', updateError);
        }

        // 14. Update issuer key usage
        await supabase
            .from('issuer_keys')
            .update({
                last_used_at: new Date().toISOString(),
                usage_count: issuerKey.usage_count + 1,
            })
            .eq('key_id', issuerKey.key_id);

        // 15. Send notification to student
        await supabase.from('notifications').insert({
            user_id: userId,
            notification_type: 'certificate_issued',
            message: `Congratulations! You've earned a certificate for completing ${template.course.title}`,
            metadata: {
                certificate_id: certificate.certificate_id,
                course_id: courseId,
                verification_url: verificationUrl,
            },
        });

        return {
            success: true,
            certificateId: certificate.certificate_id,
        };
    } catch (error) {
        console.error('Certificate issuance error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Check if student is eligible for certificate
 */
export async function checkCertificateEligibility(
    userId: string,
    courseId: number
): Promise<{
    eligible: boolean;
    completion?: any;
    reason?: string;
}> {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase.rpc('check_and_issue_certificate', {
            p_user_id: userId,
            p_course_id: courseId,
        });

        if (error) {
            throw error;
        }

        return {
            eligible: data.eligible || false,
            completion: data.completion,
            reason: data.reason,
        };
    } catch (error) {
        console.error('Eligibility check error:', error);
        return {
            eligible: false,
            reason: 'Error checking eligibility',
        };
    }
}

/**
 * Revoke a certificate
 */
export async function revokeCertificate(
    certificateId: string,
    revokedBy: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();

        const { error } = await supabase
            .from('certificates')
            .update({
                revoked_at: new Date().toISOString(),
                revoked_by: revokedBy,
                revoke_reason: reason,
            })
            .eq('certificate_id', certificateId);

        if (error) {
            throw error;
        }

        return { success: true };
    } catch (error) {
        console.error('Certificate revocation error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
