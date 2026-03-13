/**
 * Public Certificate HTML View
 * GET /api/certificates/view/[code]
 * No authentication required — renders the certificate HTML by verification code
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCertificateHTML } from '@/lib/certificate-generator'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = createAdminClient()

    const { data: certificate, error } = await supabase
      .from('certificates')
      .select(`
        *,
        profiles!certificates_user_id_fkey(full_name),
        courses(title),
        certificate_templates(
          template_name,
          issuer_name,
          design_settings,
          signature_name,
          signature_title,
          signature_image_url,
          logo_url
        )
      `)
      .eq('verification_code', code)
      .single()

    if (error || !certificate) {
      return new NextResponse('Certificate not found', { status: 404 })
    }

    if (certificate.revoked_at) {
      return new NextResponse('This certificate has been revoked', { status: 410 })
    }

    const studentName =
      certificate.profiles?.full_name ||
      certificate.credential_json?.credentialSubject?.name ||
      'Student'
    const courseTitle =
      certificate.courses?.title ||
      certificate.credential_json?.credentialSubject?.achievement?.name ||
      'Course'
    const issuerName =
      certificate.certificate_templates?.issuer_name ||
      certificate.credential_json?.issuer?.name ||
      'LMS Platform'
    const score = certificate.completion_data?.averageExamScore ?? undefined

    const template = certificate.certificate_templates
    const html = generateCertificateHTML({
      certificateNumber: certificate.verification_code,
      studentName,
      courseTitle,
      completionDate: new Date(certificate.issued_at),
      score,
      issuerName,
      designSettings: template?.design_settings,
      signatureName: template?.signature_name,
      signatureTitle: template?.signature_title,
      signatureImageUrl: template?.signature_image_url,
      logoUrl: template?.logo_url,
    })

    // Increment view count (fire-and-forget)
    supabase
      .from('certificates')
      .update({ view_count: (certificate.view_count || 0) + 1 })
      .eq('certificate_id', certificate.certificate_id)
      .then(() => {})

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Public certificate view error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
