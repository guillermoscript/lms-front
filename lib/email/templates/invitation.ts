import type { SchoolBrand } from '@/lib/themes/school-brand'
import { escapeHtml, schoolButton, schoolHeadingStyle, schoolLogoHeader } from './school-brand-parts'

export interface InvitationEmailData {
  schoolName: string
  inviterName: string
  role: 'student' | 'teacher'
  joinUrl: string
  brand: SchoolBrand
}

export function invitationTemplate(data: InvitationEmailData): { subject: string; html: string } {
  const roleLabel = data.role === 'teacher' ? 'teacher' : 'student'

  return {
    subject: `You're invited to join ${data.schoolName}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  ${schoolLogoHeader(data.brand)}
  <h2 style="${schoolHeadingStyle(data.brand)}">You're invited!</h2>
  <p>${escapeHtml(data.inviterName)} has invited you to join <strong>${escapeHtml(data.schoolName)}</strong> as a <strong>${roleLabel}</strong>.</p>
  <p>Click the button below to create your account and get started.</p>
  <p style="text-align:center;margin:32px 0">
    ${schoolButton(data.brand, data.joinUrl, `Join ${escapeHtml(data.schoolName)}`)}
  </p>
  <p style="color:#666;font-size:13px">If you didn't expect this invitation, you can safely ignore this email.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${escapeHtml(data.schoolName)}</p>
</body>
</html>`,
  }
}
