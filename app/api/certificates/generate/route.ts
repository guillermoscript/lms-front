import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { courseId } = await request.json() as { courseId: number }
    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 })
    }

    // Validate course belongs to tenant
    const { data: course } = await supabase
      .from('courses')
      .select('course_id')
      .eq('course_id', courseId)
      .eq('tenant_id', tenantId)
      .single()

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Check if certificate already exists for this user + course
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .is('revoked_at', null)
      .maybeSingle()

    if (existingCert) {
      return NextResponse.json({ certificate: existingCert })
    }

    // Use the DB function to check eligibility
    const { data: eligibility, error: eligError } = await supabase
      .rpc('check_and_issue_certificate', {
        p_user_id: user.id,
        p_course_id: courseId,
      })

    if (eligError) {
      console.error('Eligibility check error:', eligError)
      // Fallback: do a simpler check if the RPC fails (e.g., no template configured)
      return await fallbackCertificateGeneration(supabase, user.id, courseId, tenantId)
    }

    const result = eligibility as { success: boolean; reason?: string; eligible?: boolean; completion?: any; certificateId?: string }

    // If already issued (returned by RPC)
    if (!result.success && result.certificateId) {
      const { data: cert } = await supabase
        .from('certificates')
        .select('*')
        .eq('certificate_id', result.certificateId)
        .single()
      return NextResponse.json({ certificate: cert })
    }

    // If not eligible
    if (!result.success || !result.eligible) {
      return NextResponse.json(
        { error: result.reason || 'Not eligible for certificate', completion: result.completion },
        { status: 400 }
      )
    }

    // Eligible — issue the certificate
    return await issueCertificate(supabase, user.id, courseId, result.completion, tenantId)
  } catch (error) {
    console.error('Certificate generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function issueCertificate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: number,
  completionData: any,
  tenantId: string
) {
  // Get course info (already validated above, safe to use)
  const { data: courseInfo } = await supabase
    .from('courses')
    .select('title')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .single()

  if (!courseInfo) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  // Get student profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single()

  const studentName = profile?.full_name || profile?.email || 'Student'

  // Get template for this course (if exists)
  const { data: template } = await supabase
    .from('certificate_templates')
    .select('*')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  // Generate verification code
  const verificationCode = generateVerificationCode()

  // Build Open Badges 3.0 credential JSON
  const now = new Date().toISOString()
  const credentialJson = {
    '@context': ['https://www.w3.org/2018/credentials/v1', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.2.json'],
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
        name: courseInfo.title,
        description: template?.description || `Completed the course "${courseInfo.title}"`,
        criteria: {
          narrative: template?.issuance_criteria || 'Completed all required lessons and exams.',
        },
      },
    },
  }

  // Get enrollment_id
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  // Build completion snapshot
  const snapshot = completionData || { issued_via: 'fallback', timestamp: now }

  // Calculate expiration
  let expiresAt = null
  if (template?.expiration_days) {
    const exp = new Date()
    exp.setDate(exp.getDate() + template.expiration_days)
    expiresAt = exp.toISOString()
  }

  // Insert certificate
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
      completion_data: snapshot,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Certificate insert error:', insertError)
    return NextResponse.json({ error: 'Failed to generate certificate' }, { status: 500 })
  }

  return NextResponse.json({ certificate })
}

/**
 * Fallback for when there's no certificate_template configured.
 * Does a simple lesson completion check and issues a basic certificate.
 */
async function fallbackCertificateGeneration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: number,
  tenantId: string
) {
  // Verify enrollment
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .maybeSingle()

  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  // Count lessons
  const { count: totalLessons } = await supabase
    .from('lessons')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)

  if (!totalLessons || totalLessons === 0) {
    return NextResponse.json({ error: 'This course has no lessons' }, { status: 400 })
  }

  // Count completions
  const { count: completedLessons } = await supabase
    .from('lesson_completions')
    .select('*, lessons!inner(course_id)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lessons.course_id', courseId)

  if ((completedLessons ?? 0) < totalLessons) {
    return NextResponse.json(
      {
        error: 'Complete all lessons to earn your certificate',
        totalLessons,
        completedLessons: completedLessons ?? 0,
      },
      { status: 400 }
    )
  }

  // Issue certificate
  const completionData = {
    totalLessons,
    completedLessons,
    completionPercentage: 100,
    issued_via: 'fallback_no_template',
  }

  return await issueCertificate(supabase, userId, courseId, completionData, tenantId)
}

function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 20; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}
