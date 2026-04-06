import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Langfuse AI observability via OpenTelemetry
    const { LangfuseSpanProcessor } = await import("@langfuse/otel");
    const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");

    const langfuseSpanProcessor = new LangfuseSpanProcessor({
      // Only export AI SDK spans, not Next.js infra spans
      shouldExportSpan: (span) => {
        return span.otelSpan.instrumentationScope.name !== "next.js";
      },
    });

    const tracerProvider = new NodeTracerProvider({
      spanProcessors: [langfuseSpanProcessor],
    });

    tracerProvider.register();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
