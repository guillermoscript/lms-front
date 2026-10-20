/**
 * In-app notice copy for comped-plan expiry (#983), en/es by tenant locale.
 * Kept as a local catalogue (not messages/*.json) because the cron has no
 * request scope; the email is English-only like the other billing emails.
 */

export type CompedLocale = 'en' | 'es'

export interface CompedCopyParams {
  schoolName: string
  planName: string
  /** Formatted date, already in the target locale. */
  date: string
  daysRemaining?: number
}

export interface CompedCopy {
  title: string
  content: string
}

export function formatCompedDate(iso: string, locale: CompedLocale): string {
  return new Date(iso).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  })
}

export function compedNoticeCopy(locale: CompedLocale, p: CompedCopyParams): CompedCopy {
  const days = p.daysRemaining ?? 0
  if (locale === 'es') {
    return {
      title: `Tu plan cortesía ${p.planName} vence en ${days} ${days === 1 ? 'día' : 'días'}`,
      content: `El plan cortesía ${p.planName} de ${p.schoolName} vence el ${p.date}. Contrata un plan antes de esa fecha para conservar tus funciones; si no, tu escuela pasará al periodo de gracia de 7 días y luego al plan gratuito.`,
    }
  }
  return {
    title: `Your complimentary ${p.planName} plan ends in ${days} ${days === 1 ? 'day' : 'days'}`,
    content: `The complimentary ${p.planName} plan for ${p.schoolName} ends on ${p.date}. Choose a plan before then to keep your features; otherwise your school enters a 7-day grace period and is then moved to the free plan.`,
  }
}

export function compedEndedCopy(locale: CompedLocale, p: CompedCopyParams & { graceDays: number | null }): CompedCopy {
  if (locale === 'es') {
    return {
      title: 'Tu plan cortesía terminó',
      content: p.graceDays
        ? `El plan cortesía de ${p.schoolName} terminó el ${p.date}. Tienes ${p.graceDays} días de gracia para contratar un plan; después tu escuela pasará al plan gratuito.`
        : `El plan cortesía de ${p.schoolName} terminó el ${p.date}. Ya aplica la facturación normal.`,
    }
  }
  return {
    title: 'Your complimentary plan has ended',
    content: p.graceDays
      ? `The complimentary plan for ${p.schoolName} ended on ${p.date}. You have a ${p.graceDays}-day grace period to choose a plan; after that your school moves to the free plan.`
      : `The complimentary plan for ${p.schoolName} ended on ${p.date}. Normal billing now applies.`,
  }
}
