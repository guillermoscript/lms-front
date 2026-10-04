import type { SchoolBrand } from '@/lib/themes/school-brand'
import { escapeHtml, schoolButton, schoolHeadingStyle, schoolLogoHeader } from './school-brand-parts'

export interface EnrollmentConfirmedData {
  studentName: string
  courseTitle: string
  schoolName: string
  dashboardUrl: string
  brand: SchoolBrand
}

export function enrollmentConfirmedTemplate(data: EnrollmentConfirmedData): { subject: string; html: string } {
  return {
    subject: `You're enrolled in "${data.courseTitle}" — ${data.schoolName}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  ${schoolLogoHeader(data.brand)}
  <h2 style="${schoolHeadingStyle(data.brand)}">Welcome to ${escapeHtml(data.courseTitle)}!</h2>
  <p>Hi ${escapeHtml(data.studentName)},</p>
  <p>You're now enrolled in <strong>${escapeHtml(data.courseTitle)}</strong> at ${escapeHtml(data.schoolName)}. You can start learning right away.</p>
  <p style="text-align:center;margin:32px 0">
    ${schoolButton(data.brand, data.dashboardUrl, 'Go to My Courses')}
  </p>
  <p style="color:#666;font-size:13px">If you have any questions, reply to this email or contact support.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${escapeHtml(data.schoolName)}</p>
</body>
</html>`,
  }
}
