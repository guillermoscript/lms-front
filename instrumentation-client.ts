import * as Sentry from "@sentry/nextjs";

// The feedback dialog is built by Sentry outside React, so it can't reach
// next-intl's messages. `<html lang>` is server-rendered and therefore already
// correct by the time this module executes.
const isSpanish =
  typeof document !== "undefined" &&
  document.documentElement.lang.toLowerCase().startsWith("es");

const feedbackText = isSpanish
  ? {
      formTitle: "Reportar un problema",
      submitButtonLabel: "Enviar reporte",
      cancelButtonLabel: "Cancelar",
      confirmButtonLabel: "Confirmar",
      nameLabel: "Nombre",
      namePlaceholder: "Tu nombre",
      emailLabel: "Correo",
      emailPlaceholder: "tu@correo.com",
      messageLabel: "Qué pasó",
      messagePlaceholder: "Cuéntanos qué esperabas y qué ocurrió en su lugar.",
      isRequiredLabel: "(obligatorio)",
      addScreenshotButtonLabel: "Añadir captura",
      removeScreenshotButtonLabel: "Quitar captura",
      successMessageText: "Gracias, recibimos tu reporte.",
      errorEmptyMessageText: "Escribe una descripción antes de enviar.",
      errorGenericText: "No pudimos enviar el reporte. Inténtalo de nuevo.",
      errorTimeoutText: "El envío tardó demasiado. Inténtalo de nuevo.",
    }
  : {
      formTitle: "Report a problem",
      submitButtonLabel: "Send report",
      messageLabel: "What happened",
      messagePlaceholder: "Tell us what you expected and what happened instead.",
      successMessageText: "Thanks, we got your report.",
      errorEmptyMessageText: "Add a description before sending.",
    };

// The DSN comes from the environment, never a literal. It used to be hardcoded,
// which meant every fork of this repo deployed elsewhere reported its crashes into
// our Sentry project (a Vercel fork with no Supabase env vars produced the top
// issues LMS-FRONT-9B/9C/87/8X/8W). With no DSN set, `Sentry.init` is a no-op.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Browser-extension and bundler noise we cannot act on. MetaMask injects itself
  // into every page and rejects when it is locked (LMS-FRONT-9D); Sandpack's
  // bundler iframe rejects with a `digest` TypeError when its CDN is unreachable
  // (LMS-FRONT-7S) — both from third-party code, neither reaching our own.
  ignoreErrors: [
    "Failed to connect to MetaMask",
    "MetaMask",
  ],
  denyUrls: [
    /sandpack-react/i,
    /extensions\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      // No auto-injected actor button. The SDK plants a fixed bottom-right puck,
      // which sat directly on top of the lesson footer's "Next" button on mobile.
      // `components/shared/feedback-button.tsx` renders a draggable trigger
      // instead, and `components/user-nav.tsx` offers a menu entry that costs no
      // screen space at all. Both open the dialog via `lib/sentry/feedback.ts`.
      autoInject: false,
      colorScheme: "system",
      ...feedbackText,
    }),
  ],
});
