export interface PaymentFailedData {
  schoolName: string
  planName: string
  billingUrl: string
}

export function paymentFailedTemplate(data: PaymentFailedData): { subject: string; html: string } {
  return {
    subject: `Action required: Payment failed for your ${data.planName} plan`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#dc2626">Payment Failed</h2>
  <p>Hi,</p>
  <p>We were unable to process your payment for the <strong>${data.planName}</strong> plan on ${data.schoolName}.</p>
  <p>Please update your payment method to avoid interruption to your school's service.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Update Payment Method
    </a>
  </p>
  <p style="color:#666;font-size:13px">If you believe this is an error, please contact support.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">LMS Platform Billing</p>
</body>
</html>`,
  }
}
