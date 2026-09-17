import type { SchoolBrand } from '@/lib/themes/school-brand'
import { escapeHtml, schoolButton, schoolHeadingStyle, schoolLogoHeader } from './school-brand-parts'

/**
 * Branded replacements for Supabase Auth's built-in emails (issue #776),
 * rendered by `app/api/auth/send-email-hook/route.ts` and never called
 * directly by app code — GoTrue calls the hook for every one of these.
 */
export type AuthOtpKind =
  | 'signup'
  | 'magiclink'
  | 'recovery'
  | 'invite'
  /** Sent to the NEW address — despite the GoTrue field being `token_hash` (see the route). */
  | 'email_change_new'
  /** Sent to the CURRENT address — GoTrue field `token_hash_new`. */
  | 'email_change_current'

export type AuthOtpLocale = 'en' | 'es'

export function resolveAuthOtpLocale(locale: string | null | undefined): AuthOtpLocale {
  return locale?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

interface AuthOtpCopy {
  subject: (school: string) => string
  heading: string
  body: (school: string) => string
  cta: string
  footer: string
}

const COPY: Record<AuthOtpKind, Record<AuthOtpLocale, AuthOtpCopy>> = {
  signup: {
    en: {
      subject: (school) => `Confirm your email for ${school}`,
      heading: 'Confirm your email',
      body: (school) =>
        `Click the button below to confirm your email address and finish setting up your account on <strong>${school}</strong>.`,
      cta: 'Confirm email',
      footer: "If you didn't create this account, you can safely ignore this email.",
    },
    es: {
      subject: (school) => `Confirma tu correo para ${school}`,
      heading: 'Confirma tu correo',
      body: (school) =>
        `Haz clic en el botón para confirmar tu correo y terminar de crear tu cuenta en <strong>${school}</strong>.`,
      cta: 'Confirmar correo',
      footer: 'Si no creaste esta cuenta, puedes ignorar este correo.',
    },
  },
  magiclink: {
    en: {
      subject: (school) => `Your sign-in link for ${school}`,
      heading: 'Sign in',
      body: (school) =>
        `Click the button below to sign in to <strong>${school}</strong>. This link expires soon and works only once.`,
      cta: 'Sign in',
      footer: "If you didn't request this, you can safely ignore this email.",
    },
    es: {
      subject: (school) => `Tu enlace de acceso a ${school}`,
      heading: 'Iniciar sesión',
      body: (school) =>
        `Haz clic en el botón para iniciar sesión en <strong>${school}</strong>. Este enlace vence pronto y solo funciona una vez.`,
      cta: 'Iniciar sesión',
      footer: 'Si no solicitaste esto, puedes ignorar este correo.',
    },
  },
  recovery: {
    en: {
      subject: (school) => `Reset your password for ${school}`,
      heading: 'Reset your password',
      body: (school) => `Click the button below to choose a new password for your <strong>${school}</strong> account.`,
      cta: 'Reset password',
      footer: "If you didn't request this, you can safely ignore this email — your password will not change.",
    },
    es: {
      subject: (school) => `Restablece tu contraseña de ${school}`,
      heading: 'Restablece tu contraseña',
      body: (school) => `Haz clic en el botón para elegir una nueva contraseña de tu cuenta en <strong>${school}</strong>.`,
      cta: 'Restablecer contraseña',
      footer: 'Si no solicitaste esto, puedes ignorar este correo — tu contraseña no cambiará.',
    },
  },
  invite: {
    en: {
      subject: (school) => `You're invited to join ${school}`,
      heading: "You're invited",
      body: (school) => `Click the button below to accept your invitation and create your account on <strong>${school}</strong>.`,
      cta: 'Accept invitation',
      footer: "If you weren't expecting this, you can safely ignore this email.",
    },
    es: {
      subject: (school) => `Te invitaron a unirte a ${school}`,
      heading: 'Te invitaron',
      body: (school) => `Haz clic en el botón para aceptar tu invitación y crear tu cuenta en <strong>${school}</strong>.`,
      cta: 'Aceptar invitación',
      footer: 'Si no esperabas esto, puedes ignorar este correo.',
    },
  },
  email_change_new: {
    en: {
      subject: (school) => `Confirm your new email — ${school}`,
      heading: 'Confirm your new email',
      body: (school) => `Click the button below to confirm this address as your new email for <strong>${school}</strong>.`,
      cta: 'Confirm new email',
      footer: "If you didn't request this, you can safely ignore this email.",
    },
    es: {
      subject: (school) => `Confirma tu nuevo correo — ${school}`,
      heading: 'Confirma tu nuevo correo',
      body: (school) => `Haz clic en el botón para confirmar esta dirección como tu nuevo correo en <strong>${school}</strong>.`,
      cta: 'Confirmar nuevo correo',
      footer: 'Si no solicitaste esto, puedes ignorar este correo.',
    },
  },
  email_change_current: {
    en: {
      subject: (school) => `Confirm your email change — ${school}`,
      heading: 'Confirm your email change',
      body: (school) =>
        `Someone requested to change the email on your <strong>${school}</strong> account. Click the button below to confirm it was you.`,
      cta: 'Confirm change',
      footer: "If you didn't request this, secure your account and ignore this email.",
    },
    es: {
      subject: (school) => `Confirma el cambio de correo — ${school}`,
      heading: 'Confirma el cambio de correo',
      body: (school) =>
        `Alguien solicitó cambiar el correo de tu cuenta en <strong>${school}</strong>. Haz clic en el botón para confirmar que fuiste tú.`,
      cta: 'Confirmar cambio',
      footer: 'Si no solicitaste esto, protege tu cuenta e ignora este correo.',
    },
  },
}

export interface AuthOtpEmailData {
  kind: AuthOtpKind
  schoolName: string
  /** The `/auth/confirm?token_hash=...&type=...` link built by `lib/auth/send-email-hook/build-link.ts`. */
  actionUrl: string
  locale?: string | null
  brand: SchoolBrand
}

export function authOtpTemplate(data: AuthOtpEmailData): { subject: string; html: string } {
  const copy = COPY[data.kind][resolveAuthOtpLocale(data.locale)]
  const school = escapeHtml(data.schoolName)

  return {
    subject: copy.subject(data.schoolName),
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  ${schoolLogoHeader(data.brand)}
  <h2 style="${schoolHeadingStyle(data.brand)}">${copy.heading}</h2>
  <p>${copy.body(school)}</p>
  <p style="text-align:center;margin:32px 0">
    ${schoolButton(data.brand, data.actionUrl, copy.cta)}
  </p>
  <p style="color:#666;font-size:13px">${copy.footer}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${school}</p>
</body>
</html>`,
  }
}
