import { describe, it, expect } from "vitest";
import { widget, text } from "mcp-use/server";
import { brandWidgetResult } from "./register.js";
import { BRANDING_META_KEY } from "./branding.js";

/**
 * Tenant theming for widgets.
 *
 * Branding travels in the tool result's `_meta`, which the widget reads as
 * `useWidget().metadata`. These tests pin the parts that are easy to break:
 * `_meta` is shared with anything else a tool puts there, so branding must be
 * merged rather than assigned, and a caller with no session must come out the
 * other side completely untouched rather than erroring.
 */

const BRANDING = {
  name: "Escuela Marea",
  logo_url: null,
  primary_color: "#0369a1",
  secondary_color: "#0891b2",
};

/** No auth in the handler context — the unauthenticated path. */
const NO_AUTH_CTX = {};

describe("brandWidgetResult", () => {
  it("preserves _meta a tool already set", async () => {
    const result = widget({
      props: { a: 1 },
      output: text("hi"),
      metadata: { "lms/cursor": "abc123" },
    }) as { _meta?: Record<string, unknown> };

    // What the guard does once a session resolves.
    const branded: { _meta: Record<string, unknown> } = {
      ...result,
      _meta: { ...result._meta, [BRANDING_META_KEY]: BRANDING },
    };

    expect(branded._meta["lms/cursor"]).toBe("abc123");
    expect(branded._meta[BRANDING_META_KEY]).toEqual(BRANDING);
  });

  it("only touches results that render a widget", async () => {
    // structuredContent is what distinguishes a widget payload from plain text.
    const plain = text("just words") as { structuredContent?: unknown };
    expect(plain.structuredContent).toBeUndefined();

    const out = await brandWidgetResult(plain, NO_AUTH_CTX);
    expect(out).toBe(plain);
    expect((plain as { _meta?: Record<string, unknown> })._meta?.[BRANDING_META_KEY]).toBeUndefined();
  });

  it("leaves a widget result untouched when there is no session", async () => {
    const result = widget({ props: { a: 1 }, output: text("hi") });
    const before = JSON.stringify(result);

    await brandWidgetResult(result, NO_AUTH_CTX);

    // An unauthenticated caller must not crash the tool or gain a branding key.
    expect(JSON.stringify(result)).toBe(before);
    expect(
      (result as { _meta?: Record<string, unknown> })._meta?.[BRANDING_META_KEY]
    ).toBeUndefined();
  });

  it("ignores primitives and null", async () => {
    expect(await brandWidgetResult(null, NO_AUTH_CTX)).toBeNull();
    expect(await brandWidgetResult("nope", NO_AUTH_CTX)).toBe("nope");
  });
});
