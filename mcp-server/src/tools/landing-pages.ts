import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, okText, errorResult } from "../format.js";
import {
  arraySpecToSpec,
  normalizeSpec,
  specToPuckData,
  type JsonRenderElementInput,
  type PuckData,
} from "../landing/to-puck.js";
import {
  DEFAULT_PROPS_BY_TYPE,
  LANDING_PAGE_CRAFT_GUIDE,
  renderBlocksDoc,
  validateSpec,
} from "../landing/catalog.js";

/**
 * Landing-page builder tools (admin-only).
 *
 * These expose the same json-render → Puck pipeline the in-app "Generate with AI"
 * button uses, so an AI agent can draft a full landing page that opens cleanly in the
 * tenant's Puck editor for human refinement. Access is triple-gated: the tool policy
 * hides/rejects non-admin callers, each handler checks `session.isAdmin()`, and the
 * `landing_pages` RLS policy itself only grants active tenant admins.
 *
 * Workflow for agents:
 *   1. lms_get_landing_blocks    → learn the block vocabulary + page-craft guide
 *   2. lms_create_landing_page   → draft the page (sections as a flat ordered array)
 *   3. lms_publish_landing_page  → make it live (human review via preview URL first!)
 */

// ── Shared schema & helpers ──────────────────────────────────────────────────

const ElementSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .describe("Unique element id within the page, e.g. 'hero' or 'faq'"),
  type: z
    .string()
    .describe(
      "Block type name from lms_get_landing_blocks (e.g. 'HeroBlock', 'FeaturesGrid', 'CtaBanner')"
    ),
  props: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "The block's props per the vocabulary. Omitted props fall back to the block's defaults."
    ),
});

const ElementsSchema = z
  .array(ElementSchema)
  .min(1)
  .max(30)
  .describe(
    "Page sections as FLAT siblings in top-to-bottom order. Open with HeroBlock, close with CtaBanner. 6-9 sections make a complete page."
  );

const MAX_NAME_LENGTH = 255;
const MAX_SLUG_LENGTH = 100;
const RESERVED_SLUGS = ["api", "dashboard", "admin", "auth", "login", "signup", "register"];

/** Same slug rules as the app's landing-page server actions. */
function sanitizeSlug(raw: string | undefined): string {
  const slug = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return slug || "home";
}

function friendlyDbError(message: string): string {
  if (message.includes("unique") || message.includes("duplicate")) {
    return "A page with this slug already exists in this school. Choose a different slug.";
  }
  return message;
}

/**
 * Build Puck `Data` from agent-supplied elements, or report validation problems.
 * Runs the exact fold → normalize → validate → bridge pipeline the app uses.
 */
function elementsToPuckData(
  elements: JsonRenderElementInput[]
): { data: PuckData; warnings: string[] } | { errors: string[] } {
  const spec = normalizeSpec(
    arraySpecToSpec({ root: elements[0]?.id ?? "page", elements })
  );
  const { errors, warnings } = validateSpec(spec);
  if (errors.length > 0) return { errors };
  return { data: specToPuckData(spec, DEFAULT_PROPS_BY_TYPE), warnings };
}

function pageSummary(row: Record<string, unknown>) {
  const puck = row.puck_data as { content?: unknown[]; zones?: Record<string, unknown> } | null;
  return {
    page_id: row.page_id,
    title: row.title,
    slug: row.slug,
    is_published: row.is_published,
    block_count: Array.isArray(puck?.content) ? puck.content.length : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function previewPath(pageId: string): string {
  return `/dashboard/admin/landing-page/preview/${pageId}`;
}

/**
 * Absolute base URL of the tenant site, when derivable. In production the MCP server is
 * fronted by the Next.js proxy at https://<tenant>.<domain>/api/mcp, so stripping the
 * proxy suffix yields the site origin the preview/public paths live under.
 */
function siteBaseUrl(): string | null {
  const u = (process.env.MCP_SERVER_URL ?? "").replace(/\/$/, "");
  return u.endsWith("/api/mcp") ? u.slice(0, -"/api/mcp".length) : null;
}

// ── Section summaries for the landing-page-preview widget ────────────────────

/** Wireframe layout archetype per block type (widget rendering hint). */
const LAYOUT_BY_TYPE: Record<string, string> = {
  HeroBlock: "hero",
  CtaBanner: "band",
  CtaBlock: "band",
  EnrollCta: "band",
  Banner: "band",
  ShinyEyebrow: "band",
  SocialProof: "band",
  LogoCloud: "band",
  LogoMarquee: "band",
  StatsBand: "stats",
  StatsCounter: "stats",
  AnimatedStats: "stats",
  FeaturesGrid: "grid",
  TestimonialGrid: "grid",
  TeamGrid: "grid",
  PricingTable: "grid",
  ImageGallery: "grid",
  CourseGrid: "grid",
  CatalogBrowser: "grid",
  FaqAccordion: "list",
  FaqSplit: "list",
  Image: "media",
  Video: "media",
  ContentFeature: "media",
  Header: "nav",
  Footer: "nav",
  Navbar: "nav",
  BreadcrumbBlock: "nav",
};

interface SectionSummary {
  type: string;
  layout: string;
  heading: string;
  subtitle: string;
  ctas: string[];
  items: string[];
  itemCount: number;
  /** Explicit per-block color override (backgroundColor/accentColor prop), if set. */
  color: string | null;
}

/** Reduce a block's props to the display-friendly summary the preview widget renders. */
function summarizeSection(type: string, props: Record<string, unknown>): SectionSummary {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const heading = s(props.title) || s(props.heading) || s(props.text) || "";
  const subtitle =
    s(props.subtitle) || s(props.subheading) || s(props.description) || s(props.subtext) || "";

  const ctas: string[] = [];
  for (const key of [
    "primaryCtaLabel",
    "secondaryCtaLabel",
    "primaryLabel",
    "secondaryLabel",
    "buttonLabel",
    "ctaLabel",
    "label",
  ]) {
    const v = s(props[key]);
    if (v) ctas.push(v);
  }

  // First array-of-objects prop = the block's repeating items (features, stats, FAQs…).
  let items: string[] = [];
  let itemCount = 0;
  for (const v of Object.values(props)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
      itemCount = v.length;
      items = v
        .slice(0, 8)
        .map((raw) => {
          const o = raw as Record<string, unknown>;
          const value = s(o.value);
          const label = s(o.label);
          return (
            s(o.title) ||
            s(o.name) ||
            s(o.question) ||
            (value && label ? `${value} ${label}` : value || label) ||
            s(o.quote).slice(0, 48) ||
            s(o.text).slice(0, 48)
          );
        })
        .filter(Boolean);
      break;
    }
  }

  // Mirror the app's accentVars() precedence: explicit block color, else tenant brand.
  const rawColor = s(props.backgroundColor) || s(props.accentColor);
  const color = rawColor.trim() ? rawColor.trim() : null;

  return { type, layout: LAYOUT_BY_TYPE[type] ?? "text", heading, subtitle, ctas, items, itemCount, color };
}

/**
 * The tenant's brand primary color (`tenants.primary_color`). Blocks that don't set an
 * explicit color render with `var(--primary)` in the real app, so the wireframe must use
 * this to match. Null when unset/unreadable — the widget falls back to a neutral accent.
 */
async function tenantBrandColor(session: LmsSession): Promise<string | null> {
  const { data } = await session
    .getClient()
    .from("tenants")
    .select("primary_color")
    .eq("id", session.getTenantId())
    .maybeSingle();
  const color = (data?.primary_color as string | undefined)?.trim();
  return color ? color : null;
}

/** Props for the landing-page-preview widget, built from a DB row. */
function previewWidgetProps(
  row: Record<string, unknown>,
  brandColor: string | null,
  warnings: string[] = []
) {
  const puck = row.puck_data as PuckData | null;
  const sections = (puck?.content ?? []).map((c) => {
    const { id: _id, ...props } = c.props ?? {};
    return summarizeSection(c.type, props);
  });
  const base = siteBaseUrl();
  return {
    title: row.title as string,
    slug: row.slug as string,
    is_published: row.is_published as boolean,
    public_path: publicPath(row.slug as string),
    preview_path: previewPath(row.page_id as string),
    preview_url: base ? `${base}${previewPath(row.page_id as string)}` : null,
    brand_color: brandColor,
    sections,
    warnings: Array.isArray(warnings) ? warnings : [],
  };
}

function publicPath(slug: string): string {
  return slug === "home" ? "/" : `/p/${slug}`;
}

/** Guard shared by every tool below: authenticated + tenant admin. */
function adminSession(ctx: unknown): LmsSession {
  const session = LmsSession.fromContext(ctx as Parameters<typeof LmsSession.fromContext>[0]);
  if (!session.isAdmin()) {
    throw new Error("Landing pages are managed by school admins only.");
  }
  return session;
}

export function registerLandingPageTools(server: MCPServer) {
  // ── lms_get_landing_blocks ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_landing_blocks",
      description:
        "Get the landing-page block vocabulary (all section types with their props) plus the page-authoring guide. ALWAYS call this before composing elements for lms_create_landing_page or lms_update_landing_page.",
      schema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_input, ctx) => {
      try {
        adminSession(ctx);
        return okText(
          `# Landing-page blocks\n\n${LANDING_PAGE_CRAFT_GUIDE}\n\n${renderBlocksDoc()}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_list_landing_pages ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_landing_pages",
      description:
        "List the school's landing pages with slug, publish state, and section count.",
      schema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_input, ctx) => {
      try {
        const session = adminSession(ctx);
        const { data, error } = await session
          .getClient()
          .from("landing_pages")
          .select("page_id, title, slug, is_published, puck_data, created_at, updated_at")
          .eq("tenant_id", session.getTenantId())
          .order("created_at", { ascending: false });
        if (error) return errorResult(`Listing landing pages: ${error.message}`);

        const pages = (data ?? []).map(pageSummary);
        const lines = pages.map(
          (p) =>
            `- ${p.title} (${p.page_id}) — /${p.slug === "home" ? "" : `p/${p.slug}`} · ${p.is_published ? "PUBLISHED" : "draft"} · ${p.block_count} sections`
        );
        return ok(
          { total: pages.length, pages },
          pages.length === 0
            ? "No landing pages yet. Create one with lms_create_landing_page."
            : `${pages.length} landing page(s):\n${lines.join("\n")}`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_landing_page ───────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_landing_page",
      description:
        "Get a landing page including its full section list (block types + props), so it can be reviewed or edited with lms_update_landing_page.",
      schema: z.object({
        page_id: z.string().uuid().describe("The landing page ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "landing-page-preview",
        invoking: "Loading page...",
        invoked: "Page loaded",
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const { data, error } = await session
          .getClient()
          .from("landing_pages")
          .select("*")
          .eq("page_id", input.page_id)
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();
        if (error) return errorResult(`Fetching landing page: ${error.message}`);
        if (!data) return errorResult(`Landing page ${input.page_id} not found.`);

        const puck = data.puck_data as PuckData | null;
        const sections = (puck?.content ?? []).map((c) => {
          const { id: _id, ...props } = c.props ?? {};
          return { type: c.type, props };
        });

        // Note: with a widget, structuredContent carries the widget props — the
        // machine-readable full section list must travel in the text instead.
        return widget({
          props: previewWidgetProps(data, await tenantBrandColor(session)),
          output: text(
            `"${data.title}" (/${data.slug}) — ${data.is_published ? "PUBLISHED" : "draft"}, ${sections.length} sections: ${sections.map((s) => s.type).join(" → ") || "(empty)"}. Preview at ${previewPath(data.page_id)}.\n\nFull sections (use as the basis for lms_update_landing_page elements):\n\`\`\`json\n${JSON.stringify(sections, null, 1)}\n\`\`\``
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_create_landing_page ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_landing_page",
      description:
        "Create a landing page as a DRAFT from an ordered list of section blocks (call lms_get_landing_blocks first for the vocabulary). The page opens in the school's visual editor for human refinement; publish separately with lms_publish_landing_page.",
      schema: z.object({
        title: z.string().min(1).max(MAX_NAME_LENGTH).describe("Page name shown in the admin dashboard"),
        slug: z
          .string()
          .optional()
          .describe(
            "URL slug (lowercase letters/numbers/hyphens). 'home' (the default) is the school's homepage; anything else is served at /p/<slug>."
          ),
        elements: ElementsSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      widget: {
        name: "landing-page-preview",
        invoking: "Drafting page...",
        invoked: "Draft created",
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);

        const slug = sanitizeSlug(input.slug);
        if (RESERVED_SLUGS.includes(slug)) {
          return errorResult(`"${slug}" is a reserved path and cannot be used as a slug.`);
        }

        const built = elementsToPuckData(input.elements);
        if ("errors" in built) {
          return errorResult(
            `The page was NOT saved — fix these and retry:\n${built.errors.map((e) => `- ${e}`).join("\n")}`
          );
        }

        const { data, error } = await session
          .getClient()
          .from("landing_pages")
          .insert({
            tenant_id: session.getTenantId(),
            title: input.title.trim().slice(0, MAX_NAME_LENGTH),
            slug,
            puck_data: built.data,
            is_published: false,
          })
          .select()
          .single();
        if (error) return errorResult(friendlyDbError(error.message));

        const warningText =
          built.warnings.length > 0
            ? `\nWarnings (page saved, but review these):\n${built.warnings.map((w) => `- ${w}`).join("\n")}`
            : "";
        return widget({
          props: previewWidgetProps(data, await tenantBrandColor(session), built.warnings),
          output: text(
            `Created draft "${data.title}" (/${data.slug}, page_id ${data.page_id}) with ${built.data.content.length} sections. Preview it at ${previewPath(data.page_id)} or refine it in the visual editor, then publish with lms_publish_landing_page.${warningText}`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_update_landing_page ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_update_landing_page",
      description:
        "Update a landing page's title, slug, and/or REPLACE its entire section list. When passing elements, supply the COMPLETE page (read it first with lms_get_landing_page) — existing sections are replaced, not merged.",
      schema: z.object({
        page_id: z.string().uuid().describe("The landing page ID"),
        title: z.string().min(1).max(MAX_NAME_LENGTH).optional().describe("New page name"),
        slug: z.string().optional().describe("New URL slug"),
        elements: ElementsSchema.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "landing-page-preview",
        invoking: "Updating page...",
        invoked: "Page updated",
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const { data: existing, error: fetchError } = await session
          .getClient()
          .from("landing_pages")
          .select("page_id, title, is_published, puck_data")
          .eq("page_id", input.page_id)
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();
        if (fetchError) return errorResult(`Fetching landing page: ${fetchError.message}`);
        if (!existing) return errorResult(`Landing page ${input.page_id} not found.`);

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        let warnings: string[] = [];

        if (input.title) updates.title = input.title.trim().slice(0, MAX_NAME_LENGTH);
        if (input.slug !== undefined) {
          const slug = sanitizeSlug(input.slug);
          if (RESERVED_SLUGS.includes(slug)) {
            return errorResult(`"${slug}" is a reserved path and cannot be used as a slug.`);
          }
          updates.slug = slug;
        }
        if (input.elements) {
          const built = elementsToPuckData(input.elements);
          if ("errors" in built) {
            return errorResult(
              `The page was NOT updated — fix these and retry:\n${built.errors.map((e) => `- ${e}`).join("\n")}`
            );
          }
          updates.puck_data = built.data;
          warnings = built.warnings;
          // Human-edited pages can nest blocks inside layout zones; a flat replace drops those.
          const zones = (existing.puck_data as PuckData | null)?.zones;
          if (zones && Object.keys(zones).length > 0) {
            warnings.push(
              "The previous version had nested layout zones (from human editing) which a flat section list cannot represent — they were replaced. Ask the admin before overwriting heavily hand-edited pages."
            );
          }
        }

        const { data, error } = await session
          .getClient()
          .from("landing_pages")
          .update(updates)
          .eq("page_id", input.page_id)
          .eq("tenant_id", session.getTenantId())
          .select()
          .single();
        if (error) return errorResult(friendlyDbError(error.message));

        const warningText =
          warnings.length > 0
            ? `\nWarnings:\n${warnings.map((w) => `- ${w}`).join("\n")}`
            : "";
        return widget({
          props: previewWidgetProps(data, await tenantBrandColor(session), warnings),
          output: text(
            `Updated "${data.title}" (/${data.slug}, page_id ${data.page_id})${input.elements ? ` — now ${(data.puck_data as PuckData).content.length} sections` : ""}.${data.is_published ? " The page is LIVE; changes are visible immediately." : ""} Preview at ${previewPath(data.page_id)}.${warningText}`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_publish_landing_page ───────────────────────────────────────────────
  server.tool(
    {
      name: "lms_publish_landing_page",
      description:
        "Publish a landing page, making it publicly visible on the school's site ('home' slug = the homepage, others at /p/<slug>). Prefer having a human review the preview first.",
      schema: z.object({
        page_id: z.string().uuid().describe("The landing page ID"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const { data, error } = await session
          .getClient()
          .from("landing_pages")
          .update({ is_published: true, updated_at: new Date().toISOString() })
          .eq("page_id", input.page_id)
          .eq("tenant_id", session.getTenantId())
          .select()
          .single();
        if (error) return errorResult(`Publishing: ${error.message}`);

        return ok(
          { ...pageSummary(data), public_path: publicPath(data.slug) },
          `Published "${data.title}" at ${publicPath(data.slug)} on the school's site. Note: custom pages render publicly only for schools on a paid plan (starter+).`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_unpublish_landing_page ─────────────────────────────────────────────
  server.tool(
    {
      name: "lms_unpublish_landing_page",
      description: "Unpublish a landing page, returning it to draft (no longer publicly visible).",
      schema: z.object({
        page_id: z.string().uuid().describe("The landing page ID"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const { data, error } = await session
          .getClient()
          .from("landing_pages")
          .update({ is_published: false, updated_at: new Date().toISOString() })
          .eq("page_id", input.page_id)
          .eq("tenant_id", session.getTenantId())
          .select()
          .single();
        if (error) return errorResult(`Unpublishing: ${error.message}`);
        return ok(pageSummary(data), `"${data.title}" is now a draft (no longer public).`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_delete_landing_page ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_delete_landing_page",
      description:
        "Permanently delete a DRAFT landing page. Published pages must be unpublished first.",
      schema: z.object({
        page_id: z.string().uuid().describe("The landing page ID"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      try {
        const session = adminSession(ctx);
        const { data: existing, error: fetchError } = await session
          .getClient()
          .from("landing_pages")
          .select("page_id, title, is_published")
          .eq("page_id", input.page_id)
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();
        if (fetchError) return errorResult(`Fetching landing page: ${fetchError.message}`);
        if (!existing) return errorResult(`Landing page ${input.page_id} not found.`);
        if (existing.is_published) {
          return errorResult(
            "Cannot delete a published page. Unpublish it first with lms_unpublish_landing_page."
          );
        }

        const { error } = await session
          .getClient()
          .from("landing_pages")
          .delete()
          .eq("page_id", input.page_id)
          .eq("tenant_id", session.getTenantId());
        if (error) return errorResult(`Deleting: ${error.message}`);
        return okText(`Deleted draft landing page "${existing.title}".`);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
