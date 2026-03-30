import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: "https://e40fdc0a3e5965c1862e6594a8c2631f@o4507789962706944.ingest.us.sentry.io/4507789965721600",
      tracesSampleRate: 1.0,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: "https://e40fdc0a3e5965c1862e6594a8c2631f@o4507789962706944.ingest.us.sentry.io/4507789965721600",
      tracesSampleRate: 1.0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
