export interface PaymentRequestExpiredData {
  schoolName: string
  planName: string
  amount: string
  billingUrl: string
  ttlDays: number
}

/**
 * Sent when an unpaid bank-transfer request hits its TTL and is closed
 * (issue #546 §2). Says plainly that the request no longer holds the plan,
 * because until the TTL existed it held it indefinitely.
 */
export function paymentRequestExpiredTemplate(
  data: PaymentRequestExpiredData
): { subject: string; html: string } {
  return {
    subject: `Your ${data.planName} payment request for ${data.schoolName} has expired`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#d97706">Payment Request Expired</h2>
  <p>Hi,</p>
  <p>The bank transfer request for the <strong>${data.planName}</strong> plan on ${data.schoolName} (${data.amount}) has been open for ${data.ttlDays} days without a confirmed payment, so we've closed it.</p>
  <p>Nothing has been charged. Your plan is unchanged for now, but this request no longer holds it &mdash; if your billing period has already ended, your school will move to the free plan on the normal schedule.</p>
  <p>If you still want this plan, start a new request from the billing dashboard. If you already transferred the money, contact support and we'll match it up.</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Go to Billing
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">LMS Platform Billing</p>
</body>
</html>`,
  }
}
