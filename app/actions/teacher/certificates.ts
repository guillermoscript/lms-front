'use server'

import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
import { revalidatePath } from 'next/cache'

export interface CertificateTemplateFormData {
  template_name: string
  issuer_name: string
  issuer_url: string
  description: string
  issuance_criteria: string
  signature_name: string
  signature_title: string
  signature_image_url: string
  logo_url: string
  min_lesson_completion_pct: number
  min_exam_pass_score: number
  requires_all_exams: boolean
  expiration_days: number | null
  design_settings: {
    primary_color: string
    secondary_color: string
    show_qr_code: boolean
    logo_url: string
  }
}

export async function upsertCertificateTemplate(courseId: number, data: CertificateTemplateFormData) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)

    if (!data.template_name?.trim()) throw new Error('Template name is required')
    if (!data.issuer_name?.trim()) throw new Error('Issuer name is required')

    const { error } = await ctx.supabase
      .from('certificate_templates')
      .upsert({
        course_id: courseId,
        tenant_id: ctx.tenantId,
        template_name: data.template_name,
        issuer_name: data.issuer_name,
        issuer_url: data.issuer_url,
        description: data.description,
        issuance_criteria: data.issuance_criteria,
        signature_name: data.signature_name,
        signature_title: data.signature_title,
        signature_image_url: data.signature_image_url,
        logo_url: data.logo_url,
        min_lesson_completion_pct: data.min_lesson_completion_pct,
        min_exam_pass_score: data.min_exam_pass_score,
        requires_all_exams: data.requires_all_exams,
        expiration_days: data.expiration_days,
        design_settings: {
          ...data.design_settings,
          logo_url: data.logo_url
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'course_id,tenant_id' })

    if (error) throw error

    revalidatePath(`/dashboard/teacher/courses/${courseId}/certificates`)

    return { courseId }
  })
}
