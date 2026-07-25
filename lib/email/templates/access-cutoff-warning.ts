/**
 * Access-cutoff notification emails (issues #494, #517).
 *
 * #494 sent a single message at scheduling time. #517 turned that into a
 * ladder — scheduled → T-7 → T-1 → enforced — so the template has to speak in
 * four registers, the last of which is past tense: by the time `enforced`
 * goes out, students have already lost access and telling them it "will be"
 * restricted would be wrong.
 *
 * The per-stage copy is deliberately explicit about the blast radius (every
 * student, all courses) because that is the fact a school most needs and is
 * least likely to infer — see the "Blast radius" section of docs/MONETIZATION.md.
 */

export type AccessCutoffStage = 'scheduled' | 'reminder_7d' | 'reminder_1d' | 'enforced'

export interface AccessCutoffWarningData {
  schoolName: string
  planName: string
  reasons: string[]
  cutoffDate: string
  billingUrl: string
  /** Which rung of the reminder ladder this is. Defaults to the #494 behaviour. */
  stage?: AccessCutoffStage
}

interface StageCopy {
  subject: string
  heading: string
  lead: string
  consequence: string
  callToAction: string
}

function stageCopy(stage: AccessCutoffStage, data: AccessCutoffWarningData): StageCopy {
  const { schoolName, cutoffDate, planName } = data

  switch (stage) {
    case 'reminder_7d':
      return {
        subject: `1 week left: student access to ${schoolName} will be cut off on ${cutoffDate}`,
        heading: 'One Week Until Course Access Is Restricted',
        lead: `<strong>${schoolName}</strong> is still over the limits of its <strong>${planName}</strong> plan:`,
        consequence: `In one week — on <strong>${cutoffDate}</strong> — every student at your school will lose access to all courses, including lessons, exams, exercises and certificates. Access returns automatically once usage is back within the plan's limits or you upgrade.`,
        callToAction: 'There is still time to resolve this without any interruption for your students.',
      }
    case 'reminder_1d':
      return {
        subject: `Tomorrow: student access to ${schoolName} will be cut off on ${cutoffDate}`,
        heading: 'Course Access Is Restricted Tomorrow',
        lead: `This is the final notice before access is paused. <strong>${schoolName}</strong> is still over the limits of its <strong>${planName}</strong> plan:`,
        consequence: `Tomorrow — on <strong>${cutoffDate}</strong> — every student at your school will lose access to all courses, including lessons, exams, exercises and certificates. Nothing is deleted and no enrollment is lost, but no student will be able to open any course until this is resolved.`,
        callToAction: 'Upgrading or reducing usage today prevents the interruption entirely.',
      }
    case 'enforced':
      return {
        subject: `Student access to ${schoolName} is now paused`,
        heading: 'Course Access Is Now Paused',
        lead: `As of <strong>${cutoffDate}</strong>, course access for <strong>${schoolName}</strong> is paused because the school is over the limits of its <strong>${planName}</strong> plan:`,
        consequence: `Every student at your school has lost access to all courses — lessons, exams, exercises and certificates. Their enrollments, progress and purchases are all intact and nothing has been deleted; access is restored automatically, for everyone at once, as soon as usage is back within the plan's limits or you upgrade.`,
        callToAction: 'Restore access for your students by upgrading your plan or reducing usage.',
      }
    case 'scheduled':
    default:
      return {
        subject: `Action required: student access to ${schoolName} will be cut off on ${cutoffDate}`,
        heading: 'Course Access Will Be Restricted',
        lead: `<strong>${schoolName}</strong> is on the <strong>${planName}</strong> plan and currently exceeds its limits:`,
        consequence: `If this isn't resolved by <strong>${cutoffDate}</strong>, every student at your school will lose access to all courses — lessons, exams, exercises, and certificates — until usage is brought back within the plan's limits or you upgrade.`,
        callToAction:
          'To keep access uninterrupted, upgrade your plan or reduce usage (archive courses / remove students) before the date above.',
      }
  }
}

export function accessCutoffWarningTemplate(data: AccessCutoffWarningData): {
  subject: string
  html: string
} {
  const stage = data.stage ?? 'scheduled'
  const copy = stageCopy(stage, data)
  const buttonLabel = stage === 'enforced' ? 'Restore Access' : 'Manage Billing'

  return {
    subject: copy.subject,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#dc2626">${copy.heading}</h2>
  <p>Hi,</p>
  <p>${copy.lead}</p>
  <ul style="color:#444">
    ${data.reasons.map((r) => `<li>${r}</li>`).join('\n    ')}
  </ul>
  <p>${copy.consequence}</p>
  <p>${copy.callToAction}</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.billingUrl}" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      ${buttonLabel}
    </a>
  </p>
  <p style="color:#666;font-size:13px">If you believe this is an error, please contact support.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">LMS Platform Billing</p>
</body>
</html>`,
  }
}
