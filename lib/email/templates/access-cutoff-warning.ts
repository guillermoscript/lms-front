export interface AccessCutoffWarningData {
  schoolName: string
  planName: string
  reasons: string[]
  cutoffDate: string
  billingUrl: string
}

export function accessCutoffWarningTemplate(data: AccessCutoffWarningData): {
  subject: string
  html: string
} {
  return {
    subject: `Action required: student access to ${data.schoolName} will be cut off on ${data.cutoffDate}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#dc2626">Course Access Will Be Restricted</h2>
  <p>Hi,</p>
  <p><strong>${data.schoolName}</strong> is on the <strong>${data.planName}</strong> plan and currently exceeds its limits:</p>
  <ul style="color:#444">
    ${data.reasons.map((r) => `<li>${r}</li>`).join('\n    ')}
  </ul>
  <p>If this isn't resolved by <strong>${data.cutoffDate}</strong>, every student at your school will lose access to all courses — lessons, exams, exercises, and certificates — until usage is brought back within the plan's limits or you upgrade.</p>
  <p>To keep access uninterrupted, upgrade your plan or reduce usage (archive courses / remove students) before the date above.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Manage Billing
    </a>
  </p>
  <p style="color:#666;font-size:13px">If you believe this is an error, please contact support.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">LMS Platform Billing</p>
</body>
</html>`,
  }
}
