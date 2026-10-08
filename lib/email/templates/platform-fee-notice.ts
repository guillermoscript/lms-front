/**
 * Platform fee notices to a school's admins (#929, design 3 + 4.4): statement
 * issued, reminder (due tomorrow), overdue, sales paused, sales resumed.
 * en/es, chosen per tenant by `resolveTenantLocale()`. Platform-branded (the
 * platform bills the school), never sent to students.
 */
import { escapeHtml } from './school-brand-parts'

export type PlatformFeeNoticeKind = 'statement' | 'reminder' | 'overdue' | 'blocked' | 'resumed'

export interface PlatformFeeNoticeData {
  kind: PlatformFeeNoticeKind
  schoolName: string
  /** Pre-formatted, e.g. "$12.40" or "$12.40 + €3.00" (never summed across currencies). */
  amountLabel: string
  /** Pre-formatted due date with its zone, e.g. "Oct 4, 2026 (UTC)". */
  dueLabel: string | null
  /** Where the admin sees the balance (earnings page until the fee page ships). */
  billingUrl: string
  locale: 'en' | 'es'
  /** Statement reference, e.g. PF-202609-12. */
  statementNumber?: string | null
}

type Copy = { subject: string; heading: string; body: string; button: string; color: string }

function copyFor(d: PlatformFeeNoticeData): Copy {
  const school = escapeHtml(d.schoolName)
  const amount = escapeHtml(d.amountLabel)
  const due = d.dueLabel ? escapeHtml(d.dueLabel) : ''
  const ref = d.statementNumber ? ` (${escapeHtml(d.statementNumber)})` : ''
  if (d.locale === 'es') {
    switch (d.kind) {
      case 'statement':
        return {
          subject: `Estado de comisiones de ${d.schoolName}`,
          heading: 'Estado mensual de comisiones',
          body: `Emitimos el estado de comisiones de la plataforma de <strong>${school}</strong>${ref}: <strong>${amount}</strong>, con vencimiento el ${due}. Es un estado de cuenta, no una factura fiscal.`,
          button: 'Ver saldo',
          color: '#3A50B8',
        }
      case 'reminder':
        return {
          subject: `Recordatorio: comisiones de ${d.schoolName} vencen mañana`,
          heading: 'Vence mañana',
          body: `El saldo de comisiones de <strong>${school}</strong> (<strong>${amount}</strong>) vence el ${due}.`,
          button: 'Pagar saldo',
          color: '#3A50B8',
        }
      case 'overdue':
        return {
          subject: `Comisiones vencidas de ${d.schoolName}`,
          heading: 'Pago vencido',
          body: `El saldo de comisiones de <strong>${school}</strong> (<strong>${amount}</strong>) está vencido. Si no se paga dentro del período de gracia, la escuela dejará de aceptar nuevas ventas e inscripciones. Tus estudiantes actuales no pierden acceso.`,
          button: 'Pagar saldo',
          color: '#dc2626',
        }
      case 'blocked':
        return {
          subject: `Ventas pausadas en ${d.schoolName}`,
          heading: 'Nuevas ventas pausadas',
          body: `<strong>${school}</strong> no acepta nuevas ventas ni inscripciones hasta que se pague el saldo de comisiones (<strong>${amount}</strong>). Los estudiantes actuales mantienen su acceso y las renovaciones continúan. Al pagar, las ventas se reanudan de inmediato.`,
          button: 'Pagar saldo',
          color: '#dc2626',
        }
      case 'resumed':
        return {
          subject: `Ventas reanudadas en ${d.schoolName}`,
          heading: 'Ventas reanudadas',
          body: `Recibimos el pago. <strong>${school}</strong> vuelve a aceptar nuevas ventas e inscripciones.`,
          button: 'Ver saldo',
          color: '#16a34a',
        }
    }
  }
  switch (d.kind) {
    case 'statement':
      return {
        subject: `Platform fee statement for ${d.schoolName}`,
        heading: 'Monthly platform fee statement',
        body: `We issued the platform fee statement for <strong>${school}</strong>${ref}: <strong>${amount}</strong>, due ${due}. This is a statement, not a tax invoice.`,
        button: 'View balance',
        color: '#3A50B8',
      }
    case 'reminder':
      return {
        subject: `Reminder: platform fees for ${d.schoolName} are due tomorrow`,
        heading: 'Due tomorrow',
        body: `The platform fee balance for <strong>${school}</strong> (<strong>${amount}</strong>) is due ${due}.`,
        button: 'Pay balance',
        color: '#3A50B8',
      }
    case 'overdue':
      return {
        subject: `Platform fees overdue for ${d.schoolName}`,
        heading: 'Payment overdue',
        body: `The platform fee balance for <strong>${school}</strong> (<strong>${amount}</strong>) is overdue. If it is not paid within the grace period, the school will stop accepting new sales and enrollments. Your current students keep their access.`,
        button: 'Pay balance',
        color: '#dc2626',
      }
    case 'blocked':
      return {
        subject: `New sales paused for ${d.schoolName}`,
        heading: 'New sales paused',
        body: `<strong>${school}</strong> is not accepting new sales or enrollments until the platform fee balance (<strong>${amount}</strong>) is paid. Current students keep their access and renewals continue. Sales resume as soon as you pay.`,
        button: 'Pay balance',
        color: '#dc2626',
      }
    case 'resumed':
      return {
        subject: `Sales resumed for ${d.schoolName}`,
        heading: 'Sales resumed',
        body: `We received your payment. <strong>${school}</strong> is accepting new sales and enrollments again.`,
        button: 'View balance',
        color: '#16a34a',
      }
  }
}

export function platformFeeNoticeTemplate(data: PlatformFeeNoticeData): { subject: string; html: string } {
  const c = copyFor(data)
  const footer = data.locale === 'es' ? 'Facturación de la plataforma' : 'Platform billing'
  return {
    subject: c.subject,
    html: `<!DOCTYPE html>
<html lang="${data.locale}">
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="color:${c.color}">${c.heading}</h2>
  <p>${c.body}</p>
  <p style="text-align:center;margin:32px 0">
    <a href="${escapeHtml(data.billingUrl)}" style="background:${c.color};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">${c.button}</a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${footer}</p>
</body>
</html>`,
  }
}
