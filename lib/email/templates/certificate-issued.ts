export interface CertificateIssuedData {
  studentName: string
  courseTitle: string
  schoolName: string
  verifyUrl: string
  downloadUrl: string
}

export function certificateIssuedTemplate(data: CertificateIssuedData): { subject: string; html: string } {
  return {
    subject: `Your certificate for "${data.courseTitle}" is ready — ${data.schoolName}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#2563eb">Congratulations, ${data.studentName}!</h2>
  <p>You've successfully completed <strong>${data.courseTitle}</strong> and your certificate is ready.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.downloadUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:8px">
      Download Certificate
    </a>
    <a href="${data.verifyUrl}" style="background:#f3f4f6;color:#1a1a1a;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Verify Online
    </a>
  </p>
  <p style="color:#666;font-size:13px">Share your achievement with your network using the verify link.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${data.schoolName}</p>
</body>
</html>`,
  }
}
