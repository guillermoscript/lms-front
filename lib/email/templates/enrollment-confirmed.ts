export interface EnrollmentConfirmedData {
  studentName: string
  courseTitle: string
  schoolName: string
  dashboardUrl: string
}

export function enrollmentConfirmedTemplate(data: EnrollmentConfirmedData): { subject: string; html: string } {
  return {
    subject: `You're enrolled in "${data.courseTitle}" — ${data.schoolName}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#2563eb">Welcome to ${data.courseTitle}!</h2>
  <p>Hi ${data.studentName},</p>
  <p>You're now enrolled in <strong>${data.courseTitle}</strong> at ${data.schoolName}. You can start learning right away.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.dashboardUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Go to My Courses
    </a>
  </p>
  <p style="color:#666;font-size:13px">If you have any questions, reply to this email or contact support.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${data.schoolName}</p>
</body>
</html>`,
  }
}
