export interface DowngradeBlockedData {
  schoolName: string
  oldPlanName: string
  newPlanName: string
  reasons: string[]
  outcome: 'reverted' | 'applied_over_limit'
  billingUrl: string
}

export function downgradeBlockedTemplate(data: DowngradeBlockedData): {
  subject: string
  html: string
} {
  const reverted = data.outcome === 'reverted'
  const subject = reverted
    ? `Your downgrade to ${data.newPlanName} could not be completed`
    : `Action required: ${data.schoolName} is over its ${data.newPlanName} plan limits`
  const lead = reverted
    ? `We could not complete the downgrade of <strong>${data.schoolName}</strong> to the <strong>${data.newPlanName}</strong> plan because your school currently exceeds that plan's limits. Your subscription remains on the <strong>${data.oldPlanName}</strong> plan and your billing has not changed.`
    : `<strong>${data.schoolName}</strong> was downgraded to the <strong>${data.newPlanName}</strong> plan, but your school currently exceeds that plan's limits. Please reduce usage or upgrade your plan.`

  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#d97706">${reverted ? 'Downgrade Not Completed' : 'Over Plan Limits'}</h2>
  <p>Hi,</p>
  <p>${lead}</p>
  <ul style="color:#444">
    ${data.reasons.map((r) => `<li>${r}</li>`).join('\n    ')}
  </ul>
  <p>${
    reverted
      ? `To downgrade to ${data.newPlanName}, first reduce your usage below its limits, then change your plan again from the billing page.`
      : `If this isn't resolved within 14 days, all students at your school will lose access to all courses until usage is brought back within the ${data.newPlanName} plan's limits or you upgrade.`
  }</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:#d97706;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
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
