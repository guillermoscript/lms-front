export interface RenewalReminderData {
  schoolName: string
  planName: string
  billingUrl: string
  periodEnd: string
  overdue: boolean
}

export function renewalReminderTemplate(data: RenewalReminderData): { subject: string; html: string } {
  const subject = data.overdue
    ? `Your ${data.planName} plan payment is overdue for ${data.schoolName}`
    : `Renewal due soon: your ${data.planName} plan for ${data.schoolName}`

  const heading = data.overdue ? 'Payment Overdue' : 'Renewal Reminder'
  const headingColor = data.overdue ? '#dc2626' : '#7c3aed'
  const intro = data.overdue
    ? `Your <strong>${data.planName}</strong> plan for ${data.schoolName} lapsed on ${data.periodEnd} and is now in a grace period.`
    : `Your <strong>${data.planName}</strong> plan for ${data.schoolName} is scheduled to renew on ${data.periodEnd}.`
  const action = data.overdue
    ? `To keep your current plan, please submit your renewal payment before the grace period ends. If we don't receive it, your school will be moved to the free plan.`
    : `To avoid any interruption, please submit your renewal payment through the billing dashboard before the renewal date.`
  const buttonLabel = data.overdue ? 'Submit Renewal Payment' : 'Review Billing'
  const buttonColor = data.overdue ? '#dc2626' : '#7c3aed'

  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:${headingColor}">${heading}</h2>
  <p>Hi,</p>
  <p>${intro}</p>
  <p>${action}</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:${buttonColor};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      ${buttonLabel}
    </a>
  </p>
  <p style="color:#666;font-size:13px">If you've already submitted your renewal, you can ignore this message — it may still be awaiting confirmation.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">LMS Platform Billing</p>
</body>
</html>`,
  }
}
