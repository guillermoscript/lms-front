import { useToolContext } from "mcp-use/react";
import { deriveWidgetBrand } from "./kit-brand";

/**
 * Tenant branding for widgets — the widget-side half of school theming
 * (issue #779).
 *
 * The web app derives the school's theme kit colours and injects them as CSS
 * custom properties in the page head (`TenantCssVarsServer`). Widgets render
 * in a host iframe with no access to that, so the server resolves the same
 * kit theme, derives literal colours with `deriveWidgetBrand()`
 * (`./kit-brand.ts`), and sends them in the tool result's `_meta` (see
 * `src/branding.ts`); `<BrandStyle>` writes them into the widget document.
 *
 * The `--brand-*` ramp is derived from ONE colour — `button`, the same value
 * the app's `--primary` resolves to — with `color-mix()` in oklab, which is
 * close enough to Tailwind's own ramp to be indistinguishable at the sizes
 * widgets use it, and needs no colour maths in JS. `buttonInk` and `brandText`
 * are also exposed as `--brand-ink` / `--brand-text` for widgets that want an
 * exact AA-checked colour rather than a ramp shade. A tenant with no theme
 * kit (or no branding at all — an unauthenticated demo call) renders the
 * platform palette (teal), computed by the same `deriveWidgetBrand(null)`
 * the server falls back to, so there is exactly one "no brand" colour.
 */
export interface Branding {
  name?: string | null;
  logo_url?: string | null;
  button?: string | null;
  buttonInk?: string | null;
  brandText?: string | null;
  headingFont?: string | null;
}

/** `_meta` key the server namespaces branding under. Keep in sync with src/branding.ts. */
const BRANDING_META_KEY = "lms/branding";

/**
 * Read the tenant branding the server attached to this tool result.
 * Returns `null` when the host sent none (unbranded tenant, or a widget
 * rendered outside a branded session).
 */
export function useBranding(): Branding | null {
  const { meta } = useToolContext();
  const branding = meta?.[BRANDING_META_KEY] as Branding | undefined;
  if (!branding || typeof branding !== "object") return null;
  return branding;
}

/**
 * A CSS colour we are willing to interpolate and paste into a stylesheet.
 *
 * `button` / `buttonInk` / `brandText` are server-derived `#RRGGBB` values,
 * not free text, but this stays as defense in depth: anything that is not
 * hex, rgb()/hsl()/oklch() with numeric arguments, or a bare CSS keyword
 * fails the test and is dropped rather than pasted into a `<style>` tag.
 */
const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|lab|lch|oklab)a?\([0-9a-z.,%/\s-]+\)|[a-z]+)$/i;

function safeColor(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.length > 64) return null;
  return SAFE_COLOR.test(v) ? v : null;
}

/**
 * The platform palette (teal), from `deriveWidgetBrand(null)` — the same
 * "no theme kit" colours `src/branding.ts` falls back to. Used both for a
 * tenant with no theme kit and for a widget rendered with no branding `_meta`
 * at all (no session, e.g. an unauthenticated demo call).
 */
const PLATFORM_BRAND = deriveWidgetBrand(null);

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
 * Always renders: with no branding at all, or a tenant on the platform
 * palette, it emits the same teal `deriveWidgetBrand(null)` gives the server,
 * which is what the `bg-[var(--brand-600)]` utilities resolve against.
 */
export function BrandStyle({ branding }: { branding: Branding | null }) {
  const base = safeColor(branding?.button) ?? PLATFORM_BRAND.button;
  const ink = safeColor(branding?.buttonInk) ?? PLATFORM_BRAND.buttonInk;
  const text = safeColor(branding?.brandText) ?? PLATFORM_BRAND.brandText;
  const vars = ramp(base);
  const body = Object.entries(vars)
    .map(([shade, value]) => `--brand-${shade}: ${value};`)
    .concat([`--brand-ink: ${ink};`, `--brand-text: ${text};`])
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
