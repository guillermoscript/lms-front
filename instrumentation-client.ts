import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e40fdc0a3e5965c1862e6594a8c2631f@o4507789962706944.ingest.us.sentry.io/4507789965721600",
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: "system",
    }),
  ],
});
