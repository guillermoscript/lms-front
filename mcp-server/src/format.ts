import { text, object, mix, error, widget } from "mcp-use";
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

/**
 * Graceful error response. Never throw from a tool handler.
 *
 * The return type pins `isError: true` (the helper always sets it, but its
 * declared type leaves it optional): a tool with an `outputSchema` must return
 * either schema-matching `structuredContent` or a provable error result, and
 * the optional flag satisfies neither branch of that compile-time check.
 */
export function errorResult(
  message: string
): ReturnType<typeof error> & { isError: true } {
  return error(`Error: ${message}`) as ReturnType<typeof error> & {
    isError: true;
  };
}

/**
 * View-bound tool result: `props` → `structuredContent`, rendered by the tool's
 * bound view.
 *
 * A thin typing shim over mcp-use's `widget()` helper. That helper's return
 * type declares `structuredContent` optional, but a tool with an
 * `outputSchema` must return a result where it is present — v2 enforces this
 * at compile time — so this narrows the type to what the helper actually
 * produces. Tool files import it as `widget` to keep call sites unchanged.
 */
type ViewToolResult<T extends Record<string, unknown>> = Omit<
  ReturnType<typeof widget<T>>,
  "structuredContent" | "content"
> & {
  structuredContent: T;
  content: NonNullable<ReturnType<typeof widget<T>>["content"]>;
};

export function viewResult<T extends Record<string, unknown>>(
  config: Parameters<typeof widget<T>>[0]
): ViewToolResult<T> {
  return widget<T>(config) as ViewToolResult<T>;
}
