import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { WIDGET_DEMOS } from "../demo-data.js";
import { BRANDING_META_KEY, type TenantBranding } from "../branding.js";

/**
 * Fake schools to preview tenant theming with.
 *
 * The real branding is injected centrally in `installToolGuards`, which these
 * tools deliberately sit in front of (they have no session to look a tenant up
 * with), so they carry their own. Same `_meta` key, same shape — this is the
 * only way to see a branded widget without a seeded tenant.
 */
const DEMO_BRANDS: Record<string, TenantBranding | null> = {
  none: null,
  ocean: {
    name: "Escuela Marea",
    logo_url: null,
    primary_color: "#0369a1",
    secondary_color: "#0891b2",
  },
  sunset: {
    name: "Academia Ocaso",
    logo_url: null,
    primary_color: "#e11d48",
    secondary_color: "#f97316",
  },
  forest: {
    name: "Instituto Verde",
    logo_url: null,
    primary_color: "#15803d",
    secondary_color: "#4d7c0f",
  },
};

/**
 * Dev-only widget preview tools.
 *
 * One `lms_demo_<widget>` tool per entry in `WIDGET_DEMOS`, each rendering that
 * widget with hand-written fixture props (see `src/demo-data.ts`). They exist so
 * the MCP inspector can show any widget — including its empty/edge states —
 * without a seeded database, without OAuth, and without hunting for a row that
 * happens to hit the branch you're working on.
 *
 * SAFETY
 *   - Registered ONLY when `MCP_DEMO_WIDGETS=1` and `NODE_ENV !== "production"`
 *     (see `demoWidgetsEnabled()` in `src/env.ts`).
 *   - Register these BEFORE `installToolGuards()`: the guards gate every tool on
 *     the caller's tenant role, and an inspector session with no LMS login has
 *     no role, so a guarded demo tool would always be rejected. Unwrapped also
 *     means these calls never touch `mcp_audit_log`.
 *   - Handlers touch no session and no Supabase client. They are pure data.
 */
export function registerDemoTools(server: MCPServer): void {
  for (const demo of WIDGET_DEMOS) {
    const variantIds = demo.variants.map((v) => v.id) as [string, ...string[]];
    const variantList = demo.variants
      .map((v) => `${v.id} (${v.label})`)
      .join(", ");

    server.tool(
      {
        name: demo.tool,
        description: `DEMO DATA — render the '${demo.widget}' widget with fixtures instead of live data. ${demo.title}. Variants: ${variantList}.`,
        schema: z.object({
          variant: z
            .enum(variantIds)
            .optional()
            .describe(`Which fixture to render. Defaults to '${demo.variants[0].id}'.`),
          brand: z
            .enum(["none", "ocean", "sunset", "forest"])
            .optional()
            .describe(
              "Preview the widget with a fake school's brand colour. 'none' (default) uses the platform palette."
            ),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        widget: {
          name: demo.widget,
          invoking: `Rendering ${demo.widget} demo…`,
          invoked: `${demo.widget} demo ready`,
        },
      },
      async (input: { variant?: string; brand?: string }) => {
        const chosen =
          demo.variants.find((v) => v.id === input.variant) ?? demo.variants[0];
        const branding = DEMO_BRANDS[input.brand ?? "none"] ?? null;

        const result = widget({
          props: chosen.props,
          output: text(
            `[DEMO FIXTURE — not real data] ${demo.widget} · ${chosen.id}: ${chosen.label}${
              branding ? ` · brand: ${branding.name} (${branding.primary_color})` : ""
            }\n\n${chosen.output}`
          ),
        });

        return result;
      }
    );
  }

  console.log(
    `[demo] Registered ${WIDGET_DEMOS.length} widget preview tools (MCP_DEMO_WIDGETS=1). Do not enable in production.`
  );
}
