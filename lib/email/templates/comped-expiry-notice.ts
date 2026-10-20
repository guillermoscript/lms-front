export interface CompedExpiryNoticeData {
  schoolName: string
  planName: string
  /** Formatted expiry date. */
  expiryDate: string
  daysRemaining: number
  billingUrl: string
  /** `ended`: the comp already lapsed (grace started). Default: upcoming. */
  stage?: 'upcoming' | 'ended'
  /** Grace days granted when `stage` is `ended`; null when the school was already on free. */
  graceDays?: number | null
  /** Platform-owner copy: names the school and drops the call to action. */
  audience?: 'school' | 'owner'
}

export function compedExpiryNoticeTemplate(data: CompedExpiryNoticeData): { subject: string; html: string } {
  const ended = data.stage === 'ended'
  const owner = data.audience === 'owner'
  const dayWord = data.daysRemaining === 1 ? 'day' : 'days'

  const subject = ended
    ? owner
      ? `Comped plan ended: ${data.schoolName}`
      : `Your complimentary ${data.planName} plan has ended`
    : owner
      ? `Comped plan ending in ${data.daysRemaining} ${dayWord}: ${data.schoolName}`
      : `Your complimentary ${data.planName} plan ends in ${data.daysRemaining} ${dayWord}`

  const heading = ended ? 'Complimentary Plan Ended' : 'Complimentary Plan Ending'
  const color = ended ? '#dc2626' : '#7c3aed'
  const grace = data.graceDays
    ? ` The school has a ${data.graceDays}-day grace period, after which it moves to the free plan.`
    : ' Normal billing now applies.'

  let intro: string
  let action: string
  if (owner) {
    intro = ended
      ? `The complimentary <strong>${data.planName}</strong> plan for <strong>${data.schoolName}</strong> ended on ${data.expiryDate}.${grace}`
      : `The complimentary <strong>${data.planName}</strong> plan for <strong>${data.schoolName}</strong> ends on ${data.expiryDate} (${data.daysRemaining} ${dayWord} left).`
    action = ended
      ? 'No action is needed unless you want to extend or re-comp this school from the platform console.'
      : 'To extend it, update the school from the platform console before that date. Otherwise it converts to paid and enters the normal grace period.'
  } else {
    intro = ended
      ? `The complimentary <strong>${data.planName}</strong> plan for ${data.schoolName} ended on ${data.expiryDate}.${grace}`
      : `The complimentary <strong>${data.planName}</strong> plan for ${data.schoolName} ends on ${data.expiryDate}.`
    action = ended
      ? 'Choose a plan before the grace period ends to keep your current features.'
      : 'Choose a plan before then to keep your features without interruption. Otherwise your school enters a 7-day grace period and is then moved to the free plan.'
  }

  const button = owner
    ? ''
    : `<p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:${color};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      Choose a Plan
    </a>
  </p>`

  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:${color}">${heading}</h2>
  <p>Hi,</p>
  <p>${intro}</p>
  <p>${action}</p>
  ${button}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">LMS Platform Billing</p>
</body>
</html>`,
  }
}
