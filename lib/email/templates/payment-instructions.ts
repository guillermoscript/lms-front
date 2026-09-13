/**
 * "Here is how to pay" — sent to a student when the school saves payment
 * instructions on a manual (bank transfer / offline) request (issue #727).
 *
 * Until #727 the student-facing copy promised this email while nothing sent
 * one; the promise is now backed by this template and phrased conditionally
 * everywhere it is shown, because `sendEmail()` returns `false` (and the flow
 * carries on) when the school has no mailer configured (#676).
 */
export type PaymentInstructionsLocale = 'en' | 'es'

const COPY = {
  en: {
    subject: (item: string, school: string) => `Payment instructions for ${item} — ${school}`,
    heading: (item: string) => `How to pay for ${item}`,
    intro: (school: string) => `<strong>${school}</strong> has sent the payment instructions for your request.`,
    amount: 'Amount',
    method: 'Method',
    payBy: 'Pay by',
    afterPaying: 'Once you have paid, upload your receipt on your request page so the school can confirm it.',
    cta: 'Open my payment request',
  },
  es: {
    subject: (item: string, school: string) => `Instrucciones de pago para ${item} — ${school}`,
    heading: (item: string) => `Cómo pagar ${item}`,
    intro: (school: string) => `<strong>${school}</strong> te envió las instrucciones de pago de tu solicitud.`,
    amount: 'Monto',
    method: 'Método',
    payBy: 'Paga antes del',
    afterPaying: 'Cuando hayas pagado, sube el comprobante en la página de tu solicitud para que la escuela lo confirme.',
    cta: 'Abrir mi solicitud de pago',
  },
} as const

/** The manual rail is used most in LATAM, so this email follows the reader. */
export function resolvePaymentInstructionsLocale(
  locale: string | null | undefined
): PaymentInstructionsLocale {
  return locale?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export interface PaymentInstructionsEmailData {
  schoolName: string
  itemName: string
  /** Already formatted in the request's own currency, e.g. `COP 120.000`. */
  amountLabel: string
  paymentMethod: string | null
  instructions: string
  /** Already formatted for the student; omitted when the school set none. */
  deadlineLabel?: string | null
  /** Absolute link to the student's request page. */
  requestUrl: string
  /** Reader's locale; anything that is not Spanish falls back to English. */
  locale?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function paymentInstructionsTemplate(
  data: PaymentInstructionsEmailData
): { subject: string; html: string } {
  const copy = COPY[resolvePaymentInstructionsLocale(data.locale)]
  const school = escapeHtml(data.schoolName)
  const item = escapeHtml(data.itemName)
  const instructions = escapeHtml(data.instructions).replace(/\r?\n/g, '<br/>')

  return {
    subject: copy.subject(data.itemName, data.schoolName),
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#2563eb">${copy.heading(item)}</h2>
  <p>${copy.intro(school)}</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#666">${copy.amount}</td><td style="padding:4px 0"><strong>${escapeHtml(data.amountLabel)}</strong></td></tr>
    ${data.paymentMethod ? `<tr><td style="padding:4px 12px 4px 0;color:#666">${copy.method}</td><td style="padding:4px 0">${escapeHtml(data.paymentMethod)}</td></tr>` : ''}
    ${data.deadlineLabel ? `<tr><td style="padding:4px 12px 4px 0;color:#666">${copy.payBy}</td><td style="padding:4px 0">${escapeHtml(data.deadlineLabel)}</td></tr>` : ''}
  </table>
  <div style="background:#f5f5f5;border-radius:6px;padding:16px;margin:16px 0;line-height:1.5">${instructions}</div>
  <p>${copy.afterPaying}</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${data.requestUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      ${copy.cta}
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${school}</p>
</body>
</html>`,
  }
}
