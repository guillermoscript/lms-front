import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const sectionSchema = z.object({
  type: z.string(),
  layout: z.string(), // hero | band | stats | grid | list | media | nav | text
  heading: z.string(),
  subtitle: z.string(),
  ctas: z.array(z.string()),
  items: z.array(z.string()),
  itemCount: z.number(),
});

const propsSchema = z.object({
  title: z.string(),
  slug: z.string(),
  is_published: z.boolean(),
  public_path: z.string(),
  preview_path: z.string(),
  preview_url: z.string().nullable(),
  sections: z.array(sectionSchema),
  warnings: z.array(z.string()),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Structural preview of a landing page: each section rendered as a wireframe card (hero, stats, grids, FAQ…) in page order, with publish state and a link to the pixel-perfect admin preview",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading page…",
    invoked: "Page loaded",
  },
};

type Props = z.infer<typeof propsSchema>;
type Section = z.infer<typeof sectionSchema>;

// ── Section wireframes ───────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="absolute top-2 right-2 rounded-md bg-zinc-900/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white dark:bg-white/20">
      {type}
    </span>
  );
}

function CtaPills({ ctas, light }: { ctas: string[]; light?: boolean }) {
  if (ctas.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {ctas.map((c, i) => (
        <span
          key={i}
          className={
            i === 0
              ? "rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white"
              : light
                ? "rounded-lg border border-white/40 px-3 py-1 text-xs font-semibold text-white"
                : "rounded-lg border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
          }
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function SectionCard({ section }: { section: Section }) {
  const { layout, heading, subtitle, ctas, items, itemCount } = section;

  if (layout === "hero") {
    return (
      <div className="relative rounded-xl bg-gradient-to-br from-violet-600 to-violet-800 px-6 py-10 text-center">
        <TypeBadge type={section.type} />
        <div className="text-xl leading-tight font-bold text-white">
          {heading || "Hero headline"}
        </div>
        {subtitle && (
          <div className="mx-auto mt-2 max-w-[420px] text-[13px] leading-snug text-violet-100">
            {subtitle}
          </div>
        )}
        <CtaPills ctas={ctas} light />
      </div>
    );
  }

  if (layout === "band") {
    return (
      <div className="relative rounded-xl border border-violet-200 bg-violet-50 px-6 py-6 text-center dark:border-violet-900 dark:bg-violet-950">
        <TypeBadge type={section.type} />
        <div className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
          {heading || section.type}
        </div>
        {subtitle && (
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</div>
        )}
        {items.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {items.map((it, i) => (
              <span
                key={i}
                className="rounded-md bg-white px-2 py-1 text-[11px] text-zinc-500 shadow-sm dark:bg-zinc-900 dark:text-zinc-400"
              >
                {it}
              </span>
            ))}
          </div>
        )}
        <CtaPills ctas={ctas} />
      </div>
    );
  }

  if (layout === "stats") {
    return (
      <div className="relative rounded-xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <TypeBadge type={section.type} />
        {heading && (
          <div className="mb-3 text-center text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {heading}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-6">
          {(items.length > 0 ? items : ["—", "—", "—"]).map((it, i) => {
            const [value, ...rest] = it.split(" ");
            return (
              <div key={i} className="text-center">
                <div className="text-lg font-bold text-violet-600 tabular-nums dark:text-violet-400">
                  {value}
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {rest.join(" ") || "stat"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (layout === "grid") {
    return (
      <div className="relative rounded-xl border border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <TypeBadge type={section.type} />
        {heading && (
          <div className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">{heading}</div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(items.length > 0 ? items : Array.from({ length: 3 }, () => "")).map((it, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <div className="mb-1.5 size-5 rounded-md bg-violet-200 dark:bg-violet-800" />
              <div className="truncate text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                {it || "Item"}
              </div>
              <div className="mt-1 h-1.5 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          ))}
        </div>
        {itemCount > items.length && (
          <div className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            +{itemCount - items.length} more
          </div>
        )}
      </div>
    );
  }

  if (layout === "list") {
    return (
      <div className="relative rounded-xl border border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <TypeBadge type={section.type} />
        {heading && (
          <div className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">{heading}</div>
        )}
        <div className="flex flex-col gap-1.5">
          {(items.length > 0 ? items : ["Question one", "Question two"]).map((it, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700"
            >
              <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">{it}</span>
              <span className="text-zinc-300 dark:text-zinc-600">▾</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === "media") {
    return (
      <div className="relative flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <TypeBadge type={section.type} />
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-lg dark:bg-zinc-700">
          {section.type === "Video" ? "▶" : "🖼"}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {heading || section.type}
          </div>
          {subtitle && (
            <div className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (layout === "nav") {
    return (
      <div className="relative flex items-center justify-between rounded-xl border border-dashed border-zinc-300 bg-zinc-100 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
        <TypeBadge type={section.type} />
        <div className="size-4 rounded bg-zinc-300 dark:bg-zinc-600" />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-2 w-10 rounded bg-zinc-300 dark:bg-zinc-600" />
          ))}
        </div>
      </div>
    );
  }

  // text / default
  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <TypeBadge type={section.type} />
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {heading || section.type}
      </div>
      {subtitle && (
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</div>
      )}
      <CtaPills ctas={ctas} />
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LandingPagePreview() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading page…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { title, slug, is_published, public_path, preview_path, preview_url, sections, warnings } =
    props;

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[680px] bg-zinc-50 p-5 font-sans dark:bg-zinc-950">
          {/* Page header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="m-0 truncate text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {title}
                </h1>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                    is_published
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {is_published ? "PUBLISHED" : "DRAFT"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                {public_path} · {sections.length} sections
              </div>
            </div>
            {preview_url ? (
              <a
                href={preview_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-violet-700"
              >
                Open real preview ↗
              </a>
            ) : (
              <code className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                {preview_path}
              </code>
            )}
          </div>

          {/* Wireframe note */}
          <div className="mb-3 text-[11px] text-zinc-400 dark:text-zinc-500">
            Structural wireframe — real styling, images, and live data render in the editor/preview.
          </div>

          {/* Section flow */}
          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">
              This page has no sections yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sections.map((section, i) => (
                <SectionCard key={i} section={section} />
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
              <div className="mb-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                Warnings
              </div>
              <ul className="m-0 list-disc pl-4 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer hint */}
          <div className="mt-3 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            /{slug === "home" ? "" : `p/${slug}`} · refine visually in Dashboard → Landing Page
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
