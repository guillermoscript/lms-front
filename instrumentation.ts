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

    // AI SDK 7 no longer emits OTEL spans on its own — an integration must be
    // registered. LegacyOpenTelemetry keeps the v6 `ai.*` span shape that
    // LangfuseSpanProcessor already parses. Per-call user/tenant metadata now
    // rides on Langfuse's propagateAttributes() at each call site (the
    // experimental_telemetry.metadata option was removed in v7).
    const { registerTelemetry } = await import("ai");
    const { LegacyOpenTelemetry } = await import("@ai-sdk/otel");
    registerTelemetry(new LegacyOpenTelemetry());
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
