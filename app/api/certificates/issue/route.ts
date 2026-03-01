/**
 * Certificate Issuance API
 * POST /api/certificates/issue - Issue certificate (teacher-initiated or student self-serve)
 * GET /api/certificates/issue?courseId=X - Check eligibility
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { sendEmail } from '@/lib/email/send'
import { certificateIssuedTemplate } from '@/lib/email/templates/certificate-issued'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { courseId, userId: targetUserId } = body

    if (!courseId) {
      return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    }

    // Validate course belongs to tenant
    const { data: course } = await supabase
      .from('courses')
      .select('course_id, author_id')
      .eq('course_id', courseId)
      .eq('tenant_id', tenantId)
      .single()

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // If userId is provided, this is a teacher-initiated issuance
    const isTeacherIssue = !!targetUserId && targetUserId !== user.id
    const studentId = targetUserId || user.id

    if (isTeacherIssue) {
      // Verify teacher/admin role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)

      const isTeacherOrAdmin = roles?.some(r => r.role === 'teacher' || r.role === 'admin')
      if (!isTeacherOrAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Verify teacher owns this course (unless admin)
      const isAdmin = roles?.some(r => r.role === 'admin')
      if (!isAdmin && course.author_id !== user.id) {
        return NextResponse.json({ error: 'Not authorized for this course' }, { status: 403 })
      }
    }

    // Check if certificate already exists
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('certificate_id')
      .eq('user_id', studentId)
      .eq('course_id', courseId)
      .is('revoked_at', null)
      .maybeSingle()

    if (existingCert) {
      return NextResponse.json({
        success: false,
        reason: 'Certificate already issued',
        certificateId: existingCert.certificate_id,
      })
    }

    // Try the full issuance pipeline first (with crypto signing)
    // Falls back to simplified issuance if keys/packages aren't configured
    try {
      const { issueCertificate } = await import('@/lib/certificates/issue-certificate')
      const result = await issueCertificate(studentId, courseId)

      if (result.success) {
        // Send certificate issued email (non-blocking)
        try {
          const adminClient = createAdminClient()
          const { data: authUser } = await adminClient.auth.admin.getUserById(studentId)
          const { data: courseRow } = await supabase
            .from('courses')
            .select('title')
            .eq('course_id', courseId)
            .single()
          const { data: tenantRow } = await adminClient
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .single()

          if (authUser?.user?.email && result.certificateId) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
            const template = certificateIssuedTemplate({
              studentName: authUser.user.user_metadata?.full_name || authUser.user.email,
              courseTitle: courseRow?.title || 'the course',
              schoolName: tenantRow?.name || 'LMS Platform',
              verifyUrl: `${appUrl}/verify/${result.certificateId}`,
              downloadUrl: `${appUrl}/api/certificates/${result.certificateId}?format=pdf`,
            })
            await sendEmail({ to: authUser.user.email, ...template })
          }
        } catch (emailErr) {
          console.error('Failed to send certificate email:', emailErr)
        }

        return NextResponse.json({
          success: true,
          certificateId: result.certificateId,
        })
      }

      // If it failed due to missing keys/config, fall through to simplified issuance
      if (result.error?.includes('issuer key') || result.error?.includes('ENCRYPTION_KEY') || result.error?.includes('template')) {
        console.warn('Full issuance pipeline unavailable, using simplified issuance:', result.error)
      } else {
        return NextResponse.json({
          success: false,
          error: result.error,
          reason: result.reason,
        }, { status: 400 })
      }
    } catch (importError) {
      console.warn('Full issuance pipeline failed, using simplified issuance:', importError)
    }

    // Simplified issuance (no crypto, no PDF generation)
    return await simplifiedIssuance(supabase, studentId, courseId, tenantId, isTeacherIssue ? user.id : undefined)
  } catch (error) {
    console.error('Certificate issuance error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function simplifiedIssuance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: number,
  tenantId: string,
  issuedBy?: string,
) {
  // Check eligibility via RPC (or fallback to lesson count)
  let completionData: any = {}

  try {
    const { data: eligibility } = await supabase
      .rpc('check_and_issue_certificate', { p_user_id: userId, p_course_id: courseId })

    const result = eligibility as any
    if (result && !result.success && !result.eligible && !result.certificateId) {
      return NextResponse.json({
        success: false,
        reason: result.reason || 'Student is not yet eligible',
        completion: result.completion,
      }, { status: 400 })
    }
    completionData = result?.completion || {}
  } catch {
    // RPC not available - do simple lesson count check
    const { count: totalLessons } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId)

    const { count: completedLessons } = await supabase
      .from('lesson_completions')
      .select('*, lessons!inner(course_id)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('lessons.course_id', courseId)

    if (totalLessons && (completedLessons ?? 0) < totalLessons) {
      return NextResponse.json({
        success: false,
        reason: 'Student has not completed all lessons',
      }, { status: 400 })
    }

    completionData = { totalLessons, completedLessons, completionPercentage: 100 }
  }

  // Get course and profile info
  const { data: course } = await supabase
    .from('courses')
    .select('title')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single()

  const studentName = profile?.full_name || profile?.email || 'Student'

  // Get template (optional)
  const { data: template } = await supabase
    .from('certificate_templates')
    .select('template_id, issuer_name, issuer_url, expiration_days')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  // Generate verification code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let verificationCode = ''
  for (let i = 0; i < 20; i++) {
    verificationCode += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  const now = new Date().toISOString()
  const credentialJson = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      type: 'Profile',
      name: template?.issuer_name || 'LMS Platform',
      url: template?.issuer_url || process.env.NEXT_PUBLIC_APP_URL || '',
    },
    issuanceDate: now,
    credentialSubject: {
      type: 'AchievementSubject',
      name: studentName,
      achievement: {
        type: 'Achievement',
        name: course?.title || 'Course',
      },
    },
  }

  let expiresAt = null
  if (template?.expiration_days) {
    const exp = new Date()
    exp.setDate(exp.getDate() + template.expiration_days)
    expiresAt = exp.toISOString()
  }

  const { data: certificate, error: insertError } = await supabase
    .from('certificates')
    .insert({
      user_id: userId,
      course_id: courseId,
      template_id: template?.template_id || null,
      enrollment_id: enrollment?.enrollment_id || null,
      verification_code: verificationCode,
      credential_json: credentialJson,
      issued_at: now,
      expires_at: expiresAt,
      completion_data: {
        ...completionData,
        ...(issuedBy ? { issued_by_teacher: issuedBy } : {}),
      },
    })
    .select()
    .single()

  if (insertError) {
    console.error('Certificate insert error:', insertError)
    return NextResponse.json({ error: 'Failed to issue certificate' }, { status: 500 })
  }

  // Send certificate issued email (non-blocking)
  try {
    const adminClient = createAdminClient()
    const { data: authUser } = await adminClient.auth.admin.getUserById(userId)
    const { data: tenantRow } = await adminClient
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    if (authUser?.user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const template = certificateIssuedTemplate({
        studentName: authUser.user.user_metadata?.full_name || authUser.user.email,
        courseTitle: course?.title || 'the course',
        schoolName: tenantRow?.name || 'LMS Platform',
        verifyUrl: `${appUrl}/verify/${certificate.verification_code}`,
        downloadUrl: `${appUrl}/api/certificates/${certificate.certificate_id}?format=pdf`,
      })
      await sendEmail({ to: authUser.user.email, ...template })
    }
  } catch (emailErr) {
    console.error('Failed to send certificate email:', emailErr)
  }

  return NextResponse.json({
    success: true,
    certificateId: certificate.certificate_id,
  })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')

    if (!courseId) {
      return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
    }

    // Validate course belongs to tenant
    const { data: course } = await supabase
      .from('courses')
      .select('course_id')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .single()

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Check eligibility via RPC
    try {
      const { data, error } = await supabase.rpc('check_and_issue_certificate', {
        p_user_id: user.id,
        p_course_id: parseInt(courseId),
      })

      if (error) throw error

      return NextResponse.json({
        eligible: (data as any)?.eligible || false,
        completion: (data as any)?.completion,
        reason: (data as any)?.reason,
      })
    } catch {
      // Fallback: simple completion check
      const { count: totalLessons } = await supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', parseInt(courseId))

      const { count: completedLessons } = await supabase
        .from('lesson_completions')
        .select('*, lessons!inner(course_id)', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('lessons.course_id', parseInt(courseId))

      const eligible = totalLessons != null && totalLessons > 0 && (completedLessons ?? 0) >= totalLessons

      return NextResponse.json({
        eligible,
        completion: { totalLessons, completedLessons, completionPercentage: eligible ? 100 : Math.round(((completedLessons ?? 0) / (totalLessons || 1)) * 100) },
      })
    }
  } catch (error) {
    console.error('Eligibility check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
