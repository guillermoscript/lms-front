// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// The DSN comes from the environment, never a literal. It used to be hardcoded,
// which meant every fork of this repo deployed elsewhere reported its crashes into
// our Sentry project (a Vercel fork with no Supabase env vars produced the top
// issues LMS-FRONT-9B/9C/87/8X/8W). With no DSN set, `Sentry.init` is a no-op.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Define how likely traces are sampled. Full sampling in dev for debugging;
  // 10% in production to avoid tracing every request.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Skip Sentry's OTEL setup — we register our own NodeTracerProvider
  // with LangfuseSpanProcessor for AI observability.
  skipOpenTelemetrySetup: true,
});
