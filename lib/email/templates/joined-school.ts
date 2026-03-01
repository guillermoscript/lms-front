export interface JoinedSchoolData {
  studentName: string
  schoolName: string
  dashboardUrl: string
}

export function joinedSchoolTemplate(data: JoinedSchoolData): { subject: string; html: string } {
  return {
    subject: `Welcome to ${data.schoolName}!`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#2563eb">Welcome to ${data.schoolName}!</h2>
  <p>Hi ${data.studentName},</p>
  <p>You've successfully joined <strong>${data.schoolName}</strong>. Browse available courses and start learning today.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.dashboardUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Go to Dashboard
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${data.schoolName}</p>
</body>
</html>`,
  }
}
