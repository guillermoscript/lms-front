export interface PlanDowngradedData {
  schoolName: string
  planName: string
  billingUrl: string
}

export function planDowngradedTemplate(data: PlanDowngradedData): { subject: string; html: string } {
  return {
    subject: `Your ${data.schoolName} school has moved to the free plan`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#dc2626">Plan Downgraded</h2>
  <p>Hi,</p>
  <p>We didn't receive a renewal payment for the <strong>${data.planName}</strong> plan on ${data.schoolName} before the grace period ended, so your school has been moved to the <strong>free</strong> plan.</p>
  <p>Your courses and data are unaffected immediately, but free-plan limits now apply and your platform transaction fee has changed accordingly. If your current usage exceeds the free plan's limits, you'll receive a separate notice with a firm deadline before student access is restricted.</p>
  <p>You can upgrade again at any time from the billing dashboard.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Upgrade Your Plan
    </a>
  </p>
  <p style="color:#666;font-size:13px">If you've already submitted a renewal payment, please contact support so we can restore your plan.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">LMS Platform Billing</p>
</body>
</html>`,
  }
}
