import type { SchoolBrand } from '@/lib/themes/school-brand'
import { escapeHtml, schoolButton, schoolHeadingStyle, schoolLogoHeader } from './school-brand-parts'

export interface JoinedSchoolData {
  studentName: string
  schoolName: string
  dashboardUrl: string
  brand: SchoolBrand
}

export function joinedSchoolTemplate(data: JoinedSchoolData): { subject: string; html: string } {
  return {
    subject: `Welcome to ${data.schoolName}!`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  ${schoolLogoHeader(data.brand)}
  <h2 style="${schoolHeadingStyle(data.brand)}">Welcome to ${escapeHtml(data.schoolName)}!</h2>
  <p>Hi ${data.studentName},</p>
  <p>You've successfully joined <strong>${escapeHtml(data.schoolName)}</strong>. Browse available courses and start learning today.</p>
  <p style="text-align:center;margin:32px 0">
    ${schoolButton(data.brand, data.dashboardUrl, 'Go to Dashboard')}
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${escapeHtml(data.schoolName)}</p>
</body>
</html>`,
  }
}
