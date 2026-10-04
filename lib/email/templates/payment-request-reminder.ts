import type { SchoolBrand } from '@/lib/themes/school-brand'
import { escapeHtml, schoolButton, schoolHeadingStyle, schoolLogoHeader } from './school-brand-parts'

/**
 * "Your request expires soon" — sent once, `MANUAL_REQUEST_REMINDER_LEAD_DAYS`
 * before a student-facing `payment_requests` row lapses (issue #802).
 *
 * The manual/offline queue never told a student their request had a clock on
 * it at all until #802 added `expires_at`; without this email the first thing
 * they would hear is the school seeing an unpaid request they thought was
 * still pending. `/api/cron/expire-payment-requests` sends this and stamps
 * `reminder_sent_at` — including when the send itself fails, so a missing
 * mailer or a bounced address is not retried on every later tick.
 */
export type PaymentRequestReminderLocale = 'en' | 'es'

const COPY = {
  en: {
    subject: (item: string, school: string) => `Your payment request for ${item} expires soon — ${school}`,
    heading: (item: string) => `Your request for ${item} is about to expire`,
    intro: (school: string) =>
      `<strong>${school}</strong> is still waiting on your payment for the request below.`,
    item: 'Item',
    amount: 'Amount',
    expires: (days: number) =>
      days <= 1
        ? 'This request expires today.'
        : `This request expires in ${days} days.`,
    expiresOn: 'Expires on',
    afterExpiry:
      "If it lapses, nothing is charged — but you'll need to start a new request to pick this back up.",
    cta: 'Go to my payment request',
  },
  es: {
    subject: (item: string, school: string) => `Tu solicitud de pago para ${item} vence pronto — ${school}`,
    heading: (item: string) => `Tu solicitud para ${item} está por vencer`,
    intro: (school: string) =>
      `<strong>${school}</strong> todavía no recibe tu pago para la solicitud de abajo.`,
    item: 'Artículo',
    amount: 'Monto',
    expires: (days: number) =>
      days <= 1
        ? 'Esta solicitud vence hoy.'
        : `Esta solicitud vence en ${days} días.`,
    expiresOn: 'Vence el',
    afterExpiry:
      'Si vence, no se cobra nada — pero tendrás que iniciar una nueva solicitud para retomarla.',
    cta: 'Ir a mi solicitud de pago',
  },
} as const

/** The manual rail is used most in LATAM, so this email follows the reader. */
export function resolvePaymentRequestReminderLocale(
  locale: string | null | undefined
): PaymentRequestReminderLocale {
  return locale?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export interface PaymentRequestReminderEmailData {
  schoolName: string
  itemName: string
  /** Already formatted in the request's own currency, e.g. `COP 120.000`. */
  amountLabel: string
  /** Already formatted for the student's zone/locale. */
  deadlineLabel: string
  /** Whole days left, floor-clamped to 0 — drives the "expires today" phrasing. */
  daysRemaining: number
  /** Absolute link to the student's request page. */
  requestUrl: string
  /** Reader's locale; anything that is not Spanish falls back to English. */
  locale?: string | null
  brand: SchoolBrand
}

export function paymentRequestReminderTemplate(
  data: PaymentRequestReminderEmailData
): { subject: string; html: string } {
  const copy = COPY[resolvePaymentRequestReminderLocale(data.locale)]
  const school = escapeHtml(data.schoolName)
  const item = escapeHtml(data.itemName)

  return {
    subject: copy.subject(data.itemName, data.schoolName),
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  ${schoolLogoHeader(data.brand)}
  <h2 style="${schoolHeadingStyle(data.brand)}">${copy.heading(item)}</h2>
  <p>${copy.intro(school)}</p>
  <p><strong>${copy.expires(data.daysRemaining)}</strong></p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#666">${copy.item}</td><td style="padding:4px 0">${item}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">${copy.amount}</td><td style="padding:4px 0"><strong>${escapeHtml(data.amountLabel)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">${copy.expiresOn}</td><td style="padding:4px 0">${escapeHtml(data.deadlineLabel)}</td></tr>
  </table>
  <p>${copy.afterExpiry}</p>
  <p style="text-align:center;margin:32px 0">
    ${schoolButton(data.brand, data.requestUrl, copy.cta)}
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${school}</p>
</body>
</html>`,
  }
}
