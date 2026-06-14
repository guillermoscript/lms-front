import { text, object, mix, error } from "mcp-use/server";
import { z } from "zod";

/** Response format shared by every read tool. */
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/** Standard pagination + format fields, spread into a tool's Zod schema. */
export const PaginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe(
      "Output format: 'markdown' for human-readable or 'json' for machine-readable"
    ),
};

/**
 * Successful tool response carrying both a human-readable text body and the
 * machine-readable structured payload (mirrors the old { content, structuredContent }).
 * The model sees the text; clients can parse the structured object.
 */
export function ok(
  structured: Record<string, unknown>,
  textContent: string
): ReturnType<typeof mix> {
  return mix(text(textContent), object(structured));
}

/** Plain text success (no structured payload). */
export function okText(textContent: string): ReturnType<typeof text> {
  return text(textContent);
}

/** Graceful error response. Never throw from a tool handler. */
export function errorResult(message: string): ReturnType<typeof error> {
  return error(`Error: ${message}`);
}
