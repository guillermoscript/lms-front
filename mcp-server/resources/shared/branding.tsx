import { useWidget } from "mcp-use/react";

/**
 * Tenant branding for widgets — the widget-side half of school theming.
 *
 * The web app injects the school's colours as CSS custom properties in the page
 * head (`components/tenant/tenant-css-vars-server.tsx`). Widgets render in a
 * host iframe with no access to that, so the server sends the same values in
 * the tool result's `_meta` (see `src/branding.ts`) and `<BrandStyle>` writes
 * them into the widget document.
 *
 * The ramp is derived from ONE colour (`tenants.primary_color`) with
 * `color-mix()` in oklab, which is close enough to Tailwind's own ramp to be
 * indistinguishable in the sizes widgets use it at, and needs no colour maths
 * in JS. When the tenant has no primary colour we emit nothing at all and the
 * `@theme inline` fallbacks in `styles.css` keep the platform violet.
 */
export interface Branding {
  name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

/** `_meta` key the server namespaces branding under. Keep in sync with src/branding.ts. */
const BRANDING_META_KEY = "lms/branding";

/**
 * Read the tenant branding the server attached to this tool result.
 * Returns `null` when the host sent none (unbranded tenant, or a widget
 * rendered outside a branded session).
 */
export function useBranding(): Branding | null {
  const { metadata } = useWidget<Record<string, unknown>>();
  const meta = metadata as Record<string, unknown> | null | undefined;
  const branding = meta?.[BRANDING_META_KEY] as Branding | undefined;
  if (!branding || typeof branding !== "object") return null;
  return branding;
}

/**
 * A CSS colour we are willing to interpolate and paste into a stylesheet.
 *
 * `primary_color` is tenant-controlled text that ends up inside a `<style>`
 * tag, so it is allow-listed rather than escaped: hex, rgb()/hsl()/oklch() with
 * numeric arguments, or a bare CSS keyword. Anything else (a `;`, a `}`, a
 * `url(`, an `expression(`) fails the test and branding is dropped.
 */
const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|lab|lch|oklab)a?\([0-9a-z.,%/\s-]+\)|[a-z]+)$/i;

function safeColor(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.length > 64) return null;
  return SAFE_COLOR.test(v) ? v : null;
}

/**
 * Tailwind's violet ramp, verbatim. This is the platform default, and it is
 * what every widget rendered before tenant theming existed — an unbranded
 * school must be pixel-identical to that.
 *
 * These have to be emitted, not left to a Tailwind fallback: widgets reference
 * the ramp as `bg-[var(--brand-600)]`, and an undefined custom property makes
 * the declaration invalid, i.e. an uncoloured surface.
 */
const DEFAULT_RAMP: Record<string, string> = {
  50: "oklch(96.9% 0.016 293.756)",
  100: "oklch(94.3% 0.029 294.588)",
  200: "oklch(89.4% 0.057 293.283)",
  300: "oklch(81.1% 0.111 293.571)",
  400: "oklch(70.2% 0.183 293.541)",
  500: "oklch(60.6% 0.25 292.717)",
  600: "oklch(54.1% 0.281 293.009)",
  700: "oklch(49.1% 0.27 292.581)",
  900: "oklch(38% 0.189 293.745)",
  950: "oklch(28.3% 0.141 291.089)",
};

/**
 * Derive the ramp from a single base colour.
 *
 * 600 is the base — it is what the app treats as `--primary` — with lighter
 * shades mixed toward white and darker ones toward black in oklab, which tracks
 * Tailwind's own ramp closely enough at the sizes widgets use it. 400 carries
 * the dark-mode accent, so it stays clearly lighter than the base.
 */
function ramp(base: string): Record<string, string> {
  const lighter = (pct: number) => `color-mix(in oklab, ${base} ${100 - pct}%, white)`;
  const darker = (pct: number) => `color-mix(in oklab, ${base} ${100 - pct}%, black)`;
  return {
    50: lighter(92),
    100: lighter(84),
    200: lighter(68),
    300: lighter(50),
    400: lighter(32),
    500: lighter(14),
    600: base,
    700: darker(14),
    900: darker(48),
    950: darker(68),
  };
}

/**
 * Emit the brand ramp for this widget. Render once inside the widget root —
 * every widget does, in both its pending and loaded branches.
 *
 * Always renders: with no tenant colour it emits the platform violet, which is
 * what the `bg-[var(--brand-600)]` utilities resolve against.
 */
export function BrandStyle({ branding }: { branding: Branding | null }) {
  const base = safeColor(branding?.primary_color);
  const vars = base ? ramp(base) : DEFAULT_RAMP;
  const body = Object.entries(vars)
    .map(([shade, value]) => `--brand-${shade}: ${value};`)
    .join("\n  ");
  return <style>{`:root {\n  ${body}\n}`}</style>;
}

/**
 * Convenience wrapper: read branding from the tool result and apply it.
 * Widgets that do not need the values themselves can just render `<Brand />`.
 */
export function Brand() {
  return <BrandStyle branding={useBranding()} />;
}
