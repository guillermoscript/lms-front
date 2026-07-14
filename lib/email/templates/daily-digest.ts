import type { DigestLocale } from '@/lib/notifications/daily-digest'

export interface DailyDigestEmailData {
  schoolName: string
  firstName: string
  summary: string
  dueCards: number
  goalsPending: number
  /** Streak to warn about; 0 = no streak line. */
  streak: number
  actionUrl: string
}

export interface StreakNudgeEmailData {
  schoolName: string
  firstName: string
  streak: number
  actionUrl: string
}

const DIGEST_COPY = {
  en: {
    subject: (school: string) => `Your day at ${school}`,
    greeting: (name: string) => `Hi ${name},`,
    intro: 'Here is what is waiting for you today:',
    cards: (n: number) => `${n} review ${n === 1 ? 'card' : 'cards'} due`,
    goals: (n: number) => `${n} study ${n === 1 ? 'goal' : 'goals'} left this week`,
    streak: (n: number) => `Your ${n}-day streak ends tonight`,
    cta: 'Pick up where you left off',
    footer: 'A few minutes today keeps you on track.',
  },
  es: {
    subject: (school: string) => `Tu día en ${school}`,
    greeting: (name: string) => `Hola ${name},`,
    intro: 'Esto es lo que te espera hoy:',
    cards: (n: number) => `${n} ${n === 1 ? 'tarjeta pendiente' : 'tarjetas pendientes'} de repaso`,
    goals: (n: number) => `${n} ${n === 1 ? 'meta' : 'metas'} de estudio esta semana`,
    streak: (n: number) => `Tu racha de ${n} días termina esta noche`,
    cta: 'Continúa donde lo dejaste',
    footer: 'Unos minutos hoy te mantienen al día.',
  },
} as const

const NUDGE_COPY = {
  en: {
    subject: (streak: number) => `Your ${streak}-day streak ends tonight`,
    body: (name: string, streak: number) =>
      `${name}, one quick practice session before the day ends keeps your ${streak}-day streak alive.`,
    cta: 'Save my streak',
  },
  es: {
    subject: (streak: number) => `Tu racha de ${streak} días termina esta noche`,
    body: (name: string, streak: number) =>
      `${name}, una sesión rápida de práctica antes de que termine el día mantiene viva tu racha de ${streak} días.`,
    cta: 'Salvar mi racha',
  },
} as const

function layout(schoolName: string, inner: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
${inner}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${schoolName}</p>
</body>
</html>`
}

function ctaButton(url: string, label: string): string {
  return `<p style="text-align:center;margin:32px 0">
    <a href="${url}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">
      ${label}
    </a>
  </p>`
}

export function dailyDigestEmailTemplate(
  data: DailyDigestEmailData,
  locale: DigestLocale
): { subject: string; html: string } {
  const copy = DIGEST_COPY[locale]
  const items: string[] = []
  if (data.dueCards > 0) items.push(copy.cards(data.dueCards))
  if (data.goalsPending > 0) items.push(copy.goals(data.goalsPending))
  if (data.streak > 0) items.push(copy.streak(data.streak))
  const list = items.map((item) => `    <li style="margin:8px 0">${item}</li>`).join('\n')
  return {
    subject: copy.subject(data.schoolName),
    html: layout(
      data.schoolName,
      `  <h2>${copy.greeting(data.firstName)}</h2>
  <p>${copy.intro}</p>
  <ul style="padding-left:20px">
${list}
  </ul>
${ctaButton(data.actionUrl, copy.cta)}
  <p style="color:#666;font-size:13px">${copy.footer}</p>`
    ),
  }
}

export function streakNudgeEmailTemplate(
  data: StreakNudgeEmailData,
  locale: DigestLocale
): { subject: string; html: string } {
  const copy = NUDGE_COPY[locale]
  return {
    subject: copy.subject(data.streak),
    html: layout(
      data.schoolName,
      `  <h2>🔥 ${copy.subject(data.streak)}</h2>
  <p>${copy.body(data.firstName, data.streak)}</p>
${ctaButton(data.actionUrl, copy.cta)}`
    ),
  }
}
