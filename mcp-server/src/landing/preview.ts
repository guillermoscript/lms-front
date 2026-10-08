/**
 * Section summaries for the landing-page-preview view (critique F2).
 *
 * The view draws a structural wireframe per top-level block. Data-bound blocks (CourseHero,
 * CoursePricingCard, ProductGrid…) carry ids, not text, so their heading and items come from
 * the bound course/product/plan names in `RefLookup` — the same tenant-filtered lookup that
 * validated the ids — and `binding` tells the reader what the block is wired to.
 */
import { normalizeRefIds, pageCatalog, refKindOf, isListRef, type PageData } from "@lms/core";
import type { RefLookup } from "./page-builder.js";

/** Wireframe layout archetype per block type (view rendering hint). */
export const LAYOUT_BY_TYPE: Record<string, string> = {
  HeroBlock: "hero",
  CourseHero: "hero",
  CtaBanner: "band",
  CtaBlock: "band",
  EnrollCta: "band",
  Banner: "band",
  ShinyEyebrow: "band",
  SocialProof: "band",
  LogoCloud: "band",
  LogoMarquee: "band",
  CoursePricingCard: "band",
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
  ProductGrid: "grid",
  FaqAccordion: "list",
  FaqSplit: "list",
  CourseCurriculum: "list",
  CourseOutcomes: "list",
  Image: "media",
  Video: "media",
  ContentFeature: "media",
  InstructorCard: "media",
  Header: "nav",
  Footer: "nav",
  Navbar: "nav",
  BreadcrumbBlock: "nav",
};

export interface SectionSummary {
  type: string;
  layout: string;
  heading: string;
  subtitle: string;
  ctas: string[];
  items: string[];
  itemCount: number;
  /** Explicit per-block color override (backgroundColor/accentColor prop), if set. */
  color: string | null;
  /** What a data-bound block shows, e.g. `Course: Intro to Python`; null when unbound. */
  binding: string | null;
}

const KIND_LABEL = { course: "Course", product: "Product", plan: "Plan" } as const;
const KIND_LABEL_PLURAL = { course: "Courses", product: "Products", plan: "Plans" } as const;

/** Bound names per ref field, in prop order. Unknown ids read "#12 (not available)". */
function boundNames(type: string, props: Record<string, unknown>, lookup: RefLookup) {
  const out: { kind: "course" | "product" | "plan"; list: boolean; names: string[] }[] = [];
  for (const { key, ref } of pageCatalog.refFields(type)) {
    const ids = normalizeRefIds(props[key]);
    if (!ids.length) continue;
    const kind = refKindOf(ref);
    const names = ids.map((id) => {
      const name = lookup[kind].get(id);
      return name ? name : `#${id} (not available)`;
    });
    out.push({ kind, list: isListRef(ref), names });
  }
  return out;
}

/** Reduce a block's props to the display-friendly summary the preview view renders. */
export function summarizeSection(
  type: string,
  props: Record<string, unknown>,
  lookup: RefLookup
): SectionSummary {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const heading =
    s(props.title) || s(props.titleOverride) || s(props.heading) || s(props.headline) || s(props.text) || "";
  const subtitle =
    s(props.subtitle) ||
    s(props.subtitleOverride) ||
    s(props.subheading) ||
    s(props.description) ||
    s(props.subtext) ||
    "";

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
  for (const [key, v] of Object.entries(props)) {
    if (pageCatalog.refFields(type).some((r) => r.key === key)) continue;
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

  // Data-bound blocks: the bound record names fill what the props leave empty.
  const bound = boundNames(type, props, lookup);
  const binding = bound.length
    ? bound
        .map((b) => `${(b.list ? KIND_LABEL_PLURAL : KIND_LABEL)[b.kind]}: ${b.names.join(", ")}`)
        .join(" · ")
    : null;
  let finalHeading = heading;
  const single = bound.find((b) => !b.list);
  // CoursePricingCard: productId wins over courseId (same rule as the render).
  const productFirst = type === "CoursePricingCard" ? bound.find((b) => b.kind === "product") : undefined;
  if (!finalHeading && (productFirst ?? single)) finalHeading = (productFirst ?? single)!.names[0];
  const list = bound.find((b) => b.list);
  if (list && items.length === 0) {
    itemCount = list.names.length;
    items = list.names.slice(0, 8);
  }

  // Mirror the app's accentVars() precedence: explicit block color, else tenant brand.
  const rawColor = s(props.backgroundColor) || s(props.accentColor);
  const color = rawColor.trim() ? rawColor.trim() : null;

  return {
    type,
    layout: LAYOUT_BY_TYPE[type] ?? "text",
    heading: finalHeading,
    subtitle,
    ctas,
    items,
    itemCount,
    color,
    binding,
  };
}

export interface PreviewRow {
  page_id: string;
  title: string;
  slug: string;
  is_published: boolean;
  puck_data: PageData | null;
}

export function publicPath(slug: string): string {
  return slug === "home" ? "/" : `/p/${slug}`;
}

export function previewPath(pageId: string): string {
  return `/dashboard/admin/landing-page/preview/${pageId}`;
}

/**
 * Absolute base URL of the tenant site, when derivable. In production the MCP server is
 * fronted by the Next.js proxy at https://<tenant>.<domain>/api/mcp, so stripping the
 * proxy suffix yields the site origin the preview/public paths live under.
 */
export function siteBaseUrl(): string | null {
  const u = (process.env.MCP_SERVER_URL ?? "").replace(/\/$/, "");
  return u.endsWith("/api/mcp") ? u.slice(0, -"/api/mcp".length) : null;
}

/** Props for the landing-page-preview view, built from a DB row. */
export function previewViewProps(
  row: PreviewRow,
  brandColor: string | null,
  lookup: RefLookup,
  warnings: string[] = []
) {
  const content = Array.isArray(row.puck_data?.content) ? row.puck_data!.content : [];
  const sections = content.map((c) => {
    const { id: _id, ...props } = (c?.props ?? {}) as Record<string, unknown>;
    return summarizeSection(String(c?.type ?? ""), props, lookup);
  });
  const base = siteBaseUrl();
  return {
    title: row.title,
    slug: row.slug,
    is_published: row.is_published,
    public_path: publicPath(row.slug),
    preview_path: previewPath(row.page_id),
    preview_url: base ? `${base}${previewPath(row.page_id)}` : null,
    brand_color: brandColor,
    sections,
    warnings: Array.isArray(warnings) ? warnings.slice(0, 20) : [],
  };
}
