import { text, object, mix, widget } from "mcp-use";
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

/**
 * Raw MCP envelope for a tool that declares an `outputSchema`: a one-line
 * summary, then the payload serialized as a second text block, plus
 * `structuredContent` (typed against the schema at the callback's return
 * position). The serialized copy is what `ok()` adds through `object()` and
 * what the MCP spec asks for: a host that hands the model only `content` must
 * still see the data. Prefer this over `ok()` in new tools — the response
 * helpers `ok()` wraps are deprecated in mcp-use v2.
 */
export function structured<T extends Record<string, unknown>>(
  data: T,
  textContent: string
): { content: { type: "text"; text: string }[]; structuredContent: T } {
  return {
    content: [
      { type: "text", text: textContent },
      { type: "text", text: JSON.stringify(data) },
    ],
    structuredContent: data,
  };
}

/** Plain text success (no structured payload). */
export function okText(textContent: string): ReturnType<typeof text> {
  return text(textContent);
}

/**
 * Graceful error response. Never throw from a tool handler.
 *
 * Return the raw v2 MCP error envelope with a literal `isError: true`, so
 * schema-backed tools can report failures without their success payload.
 * Upstream key failures carry a configuration code; other failures have no
 * invented argument-error classification.
 */
export function errorResult(
  message: string
): {
  isError: true;
  content: { type: "text"; text: string }[];
  structuredContent?: { error_code: string };
} {
  // This is an upstream configuration failure, not invalid tool arguments.
  // A valid OAuth JWT can pass verification while Supabase rejects the apikey.
  if (/unregistered api key|invalid api key|no api key found/i.test(message)) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: "Error: Supabase rejected the MCP server's public API key. Set MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY to a current publishable or anon key from the same project as MCP_USE_OAUTH_SUPABASE_URL / SUPABASE_URL. Check for an old higher-priority MCP_USE_* value, then restart the MCP server. Run npm run check:connection in mcp-server to verify. Changing tool arguments or reconnecting OAuth will not repair this server configuration.",
      }],
      structuredContent: { error_code: "UPSTREAM_CONFIGURATION_ERROR" },
    };
  }
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
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
