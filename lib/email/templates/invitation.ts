export interface InvitationEmailData {
  schoolName: string
  inviterName: string
  role: 'student' | 'teacher'
  joinUrl: string
}

export function invitationTemplate(data: InvitationEmailData): { subject: string; html: string } {
  const roleLabel = data.role === 'teacher' ? 'teacher' : 'student'

  return {
    subject: `You're invited to join ${data.schoolName}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#2563eb">You're invited!</h2>
  <p>${data.inviterName} has invited you to join <strong>${data.schoolName}</strong> as a <strong>${roleLabel}</strong>.</p>
  <p>Click the button below to create your account and get started.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.joinUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Join ${data.schoolName}
    </a>
  </p>
  <p style="color:#666;font-size:13px">If you didn't expect this invitation, you can safely ignore this email.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${data.schoolName}</p>
</body>
</html>`,
  }
}
