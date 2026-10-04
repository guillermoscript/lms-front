import { NextRequest, NextResponse } from 'next/server'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { generateCertificateHTML } from '@/lib/certificate-generator'
import { generateCertificatePDF } from '@/lib/certificates/pdf-generator'
import { getSchoolBrand } from '@/lib/themes/school-brand'
import { resolveCertificateDesign } from '@/lib/certificates/default-design'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Serves the browser (session cookies + the subdomain's x-tenant-id) and
    // the native app (Authorization: Bearer + the tenant from the verified JWT
    // claim) from one path — the app cannot send a cookie, and without this it
    // saved the 401 body as the student's certificate PDF.
    const auth = await getApiAuthContext(request)
    if (!auth) return new NextResponse('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    const { id } = await params
    const format = request.nextUrl.searchParams.get('format')

    // Get certificate with course info and validate tenant
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select(`
        *,
        courses (title, tenant_id),
        certificate_templates (
          template_name,
          issuer_name,
          design_settings,
          signature_name,
          signature_title,
          signature_image_url,
          logo_url
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
      const tmpl = certificate.certificate_templates
      const brand = await getSchoolBrand(tenantId)
      const design = resolveCertificateDesign(tmpl?.design_settings, brand.outputs)
      const pdfBuffer = await generateCertificatePDF({
        studentName,
        courseTitle,
        completionDate: new Date(certificate.issued_at),
        issuedDate: new Date(certificate.issued_at),
        verificationCode: certificate.verification_code,
        verificationUrl,
        issuerName,
        issuerLogo: tmpl?.logo_url || tmpl?.design_settings?.logo_url,
        signatureName: tmpl?.signature_name,
        signatureTitle: tmpl?.signature_title,
        signatureImage: tmpl?.signature_image_url,
        score,
        design,
        showQrCode: tmpl?.design_settings?.show_qr_code,
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
    const template = certificate.certificate_templates
    const brand = await getSchoolBrand(tenantId)
    const html = generateCertificateHTML({
      certificateNumber: certificate.verification_code,
      studentName,
      courseTitle,
      completionDate: new Date(certificate.issued_at),
      score,
      issuerName,
      design: resolveCertificateDesign(template?.design_settings, brand.outputs),
      signatureName: template?.signature_name,
      signatureTitle: template?.signature_title,
      signatureImageUrl: template?.signature_image_url,
      logoUrl: template?.logo_url || template?.design_settings?.logo_url,
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
