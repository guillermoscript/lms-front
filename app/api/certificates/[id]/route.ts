import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCertificateHTML } from '@/lib/certificate-generator'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Get certificate with course info
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select(`
        *,
        courses (title),
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

    // Check authorization
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const isAdmin = roles?.some(r => r.role === 'admin')
    const isOwner = certificate.user_id === user.id

    if (!isAdmin && !isOwner) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Extract student name from credential
    const studentName = certificate.credential_json?.credentialSubject?.name || 'Student'
    const courseTitle = certificate.courses?.title || certificate.credential_json?.credentialSubject?.achievement?.name || 'Course'
    const issuerName = certificate.certificate_templates?.issuer_name || certificate.credential_json?.issuer?.name || 'LMS Platform'
    const score = certificate.completion_data?.averageExamScore || null

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
