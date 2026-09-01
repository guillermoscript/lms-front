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

  // Sentry ↔ OpenPanel cross-link, server leg. Same contract as the client's
  // `beforeSend` in `instrumentation-client.ts`: Sentry keeps the error, an
  // `error_captured` pointer event (just the `sentry_event_id`) goes to
  // OpenPanel. Fire-and-forget — `track()` can never throw, and delaying or
  // failing the Sentry event over analytics would invert the priorities.
  // Loop-safety: `lib/analytics/server.ts` reports its own failures only as
  // breadcrumbs, never as captured events, so this cannot ping-pong.
  beforeSend(event) {
    try {
      if (event.event_id) {
        // Dynamic import keeps Sentry init free of the analytics module (and
        // its vendor SDK) on cold start; by the first error it is warm.
        void import("@/lib/analytics/server").then(({ track }) =>
          track(
            "error_captured",
            {
              sentry_event_id: event.event_id as string,
              source: "server",
              error_name: event.exception?.values?.[0]?.type,
            },
            { userId: event.user?.id != null ? String(event.user.id) : null }
          )
        ).catch(() => undefined);
        event.tags = { ...event.tags, "openpanel.pointer": "sent" };
      }
    } catch {
      // Telemetry must never break telemetry.
    }
    return event;
  },
});
