import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCertificateHTML } from '@/lib/certificate-generator'
import { generateCertificatePDF } from '@/lib/certificates/pdf-generator'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const { id } = await params
    const format = request.nextUrl.searchParams.get('format')

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Get certificate with course info and validate tenant
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select(`
        *,
        courses (title, tenant_id),
        certificate_templates (
          template_name,
          issuer_name,
          design_settings
        )
      `)
      .eq('certificate_id', id)
      .single()

    if (certError || !certificate) {
      return new NextResponse('Certificate not found', { status: 404 })
    }

    // Validate certificate belongs to tenant
    if (certificate.courses?.tenant_id !== tenantId) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Check authorization — student must own it, or be an admin
    const isOwner = certificate.user_id === user.id
    if (!isOwner) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
      const isAdmin = roles?.some(r => r.role === 'admin')
      if (!isAdmin) {
        return new NextResponse('Forbidden', { status: 403 })
      }
    }

    // Extract certificate data
    const studentName = certificate.credential_json?.credentialSubject?.name || 'Student'
    const courseTitle = certificate.courses?.title || certificate.credential_json?.credentialSubject?.achievement?.name || 'Course'
    const issuerName = certificate.certificate_templates?.issuer_name || certificate.credential_json?.issuer?.name || 'LMS Platform'
    const score = certificate.completion_data?.averageExamScore || undefined
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'}/verify/${certificate.verification_code}`

    // PDF download
    if (format === 'pdf') {
      const pdfBuffer = await generateCertificatePDF({
        studentName,
        courseTitle,
        completionDate: new Date(certificate.issued_at),
        issuedDate: new Date(certificate.issued_at),
        verificationCode: certificate.verification_code,
        verificationUrl,
        issuerName,
        issuerLogo: certificate.certificate_templates?.design_settings?.logo_url,
        score,
        designConfig: certificate.certificate_templates?.design_settings,
      })

      const safeName = courseTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      return new NextResponse(pdfBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="certificate-${safeName}.pdf"`,
        },
      })
    }

    // HTML view (default)
    const html = generateCertificateHTML({
      certificateNumber: certificate.verification_code,
      studentName,
      courseTitle,
      completionDate: new Date(certificate.issued_at),
      score,
      issuerName,
      designSettings: certificate.certificate_templates?.design_settings,
    })

    // Increment view count
    await supabase
      .from('certificates')
      .update({ view_count: (certificate.view_count || 0) + 1 })
      .eq('certificate_id', id)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('Certificate view error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
