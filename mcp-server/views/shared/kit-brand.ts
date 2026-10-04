/**
 * Theme kit brand derivation — MCP-server mirror (issue #779).
 *
 * `src/branding.ts` reads a tenant's stored theme kit choice
 * (`tenant_settings.theme_preset`, `{ type: 'kit', theme, brand }`) and calls
 * `deriveWidgetBrand()` here to turn it into literal colours; `useBranding()`
 * / `BrandStyle` in `views/shared/branding.tsx` apply the result.
 *
 * Mirrors the parts of `lib/themes/kit.ts` and `lib/themes/brand-outputs.ts`
 * that widgets actually need — the four kit themes' swatches and type
 * pairings, `resolveSchoolTheme`'s plan gate, and the button/text colour maths
 * — because `mcp-server` is bundled and deployed standalone (Docker context
 * `./mcp-server`) and cannot import from the app's `lib/`. Same reason
 * `./contrast.ts` mirrors `lib/color/contrast.ts` (see its header).
 *
 * Deliberately smaller than the root: no email font files, no PDF/OG-image
 * outputs (`tint`, `deep`, `deepInk`, `deepMuted`, `emailHeadingFontStack`) —
 * those stay in `lib/themes/brand-outputs.ts` for the app surfaces that need
 * them. `button`, `buttonInk` and `brandText` are computed with the exact same
 * inputs and functions as the root (`readableButton`, `mixOklch`,
 * `accentTextOn` from `./contrast`), so the values match; `mcp-server/tests/
 * kit-brand.test.ts` pins fixtures cross-checked against
 * `lib/themes/brand-outputs.ts` to catch drift.
 */
import { accentTextOn, mixOklch, readableButton } from "./contrast";

export const KIT_THEME_IDS = ["estructura", "andina", "kodigo", "luz"] as const;
export type KitThemeId = (typeof KIT_THEME_IDS)[number];

type KitTypePairingId = "structured" | "classic" | "friendly" | "plain";

interface KitSwatch {
  hex: string;
  name: string;
}

/** Theme → recommended swatches (first is the default) + type pairing. */
const KIT_THEME_META: Record<
  KitThemeId,
  { typePairing: KitTypePairingId; swatches: readonly KitSwatch[] }
> = {
  estructura: {
    typePairing: "structured",
    swatches: [
      { hex: "#3A50B8", name: "Tinta azul" },
      { hex: "#0E7C86", name: "Petróleo" },
      { hex: "#2F6B4F", name: "Bosque" },
      { hex: "#6B3FA0", name: "Ciruela" },
      { hex: "#B5462F", name: "Ladrillo" },
      { hex: "#2B2F3A", name: "Grafito" },
    ],
  },
  andina: {
    typePairing: "classic",
    swatches: [
      { hex: "#2F6B4F", name: "Verde andino" },
      { hex: "#9A3F2C", name: "Terracota" },
      { hex: "#1F4E79", name: "Añil" },
      { hex: "#8A6414", name: "Ocre" },
      { hex: "#5B3A6E", name: "Quinoa" },
      { hex: "#5A3A2A", name: "Cacao" },
    ],
  },
  kodigo: {
    typePairing: "plain",
    swatches: [
      { hex: "#F2B705", name: "Amarillo" },
      { hex: "#3DDC97", name: "Terminal" },
      { hex: "#4CC9F0", name: "Cian" },
      { hex: "#FF7A3D", name: "Naranja" },
      { hex: "#C8A2FF", name: "Lila" },
      { hex: "#FF5C8A", name: "Rosa" },
    ],
  },
  luz: {
    typePairing: "friendly",
    swatches: [
      { hex: "#C2185B", name: "Magenta" },
      { hex: "#E4572E", name: "Coral" },
      { hex: "#7B2CBF", name: "Violeta" },
      { hex: "#0077B6", name: "Océano" },
      { hex: "#1F9D8F", name: "Turquesa" },
      { hex: "#F4A261", name: "Durazno" },
    ],
  },
};

/** Heading family per type pairing (`lib/themes/kit.ts` `KIT_TYPE_PAIRINGS`). */
const KIT_HEADING_FONT: Record<KitTypePairingId, string> = {
  structured: "Instrument Sans",
  classic: "Lora",
  friendly: "Outfit",
  plain: "Noto Sans",
};

/** `toHex(parseColor(KIT_LIGHT_INK))` / `...KIT_DARK_INK` from `lib/themes/kit.ts`. */
const LIGHT_INK_HEX = "#FCFCFC";
const DARK_INK_HEX = "#11161F";

const BRAND_HEX = /^#[0-9a-f]{6}$/i;

function isKitThemeId(v: unknown): v is KitThemeId {
  return typeof v === "string" && (KIT_THEME_IDS as readonly string[]).includes(v);
}

/** A `#RRGGBB` brand (uppercased), or the theme's recommended swatch for anything else. */
function normalizeKitBrand(theme: KitThemeId, brand: unknown): string {
  if (typeof brand === "string") {
    const trimmed = brand.trim();
    if (BRAND_HEX.test(trimmed)) return trimmed.toUpperCase();
  }
  return KIT_THEME_META[theme].swatches[0].hex;
}

/** Whether `brand` is one of `theme`'s six recommended swatches (case-insensitive). */
function isKitSwatch(theme: KitThemeId, brand: string): boolean {
  const hex = brand.trim().toUpperCase();
  return KIT_THEME_META[theme].swatches.some((swatch) => swatch.hex === hex);
}

/** The `tenant_settings.setting_key` holding a school's theme. */
export const SCHOOL_THEME_SETTING_KEY = "theme_preset";

/** A school's theme as stored in `tenant_settings.setting_value`. */
export interface StoredKitTheme {
  type: "kit";
  theme: KitThemeId;
  brand: string;
}

/** Validates a raw `setting_value`; anything malformed is `null`. */
export function parseStoredKitTheme(value: unknown): StoredKitTheme | null {
  if (!value || typeof value !== "object") return null;
  const { type, theme, brand } = value as Record<string, unknown>;
  if (type !== "kit" || !isKitThemeId(theme) || typeof brand !== "string") return null;
  const hex = brand.trim();
  if (!BRAND_HEX.test(hex)) return null;
  return { type: "kit", theme, brand: hex.toUpperCase() };
}

/**
 * The theme a school actually renders with: its stored choice, gated by plan.
 * A custom brand colour needs `custom_branding`; without it a school keeps
 * its theme on that theme's recommended swatch. `null` means the platform
 * palette. Mirrors `resolveSchoolTheme` in `lib/themes/kit.ts`.
 */
export function resolveSchoolTheme(
  value: unknown,
  { customBranding }: { customBranding: boolean }
): StoredKitTheme | null {
  const stored = parseStoredKitTheme(value);
  if (!stored) return null;
  if (customBranding || isKitSwatch(stored.theme, stored.brand)) return stored;
  return { ...stored, brand: KIT_THEME_META[stored.theme].swatches[0].hex };
}

/** The platform palette's brand — `PLATFORM_BRAND_HEX` in `lib/themes/brand-outputs.ts`. */
const PLATFORM_BRAND_HEX = "#007595";

/** The paper every output is designed on. */
const BRAND_PAPER = "#FFFFFF";

export interface WidgetBrandOutputs {
  /** The plan-resolved theme, or `null` on the platform palette. */
  themeId: KitThemeId | null;
  /** The brand as picked (`#RRGGBB`). Decorative only. */
  brand: string;
  /** A filled button/badge colour — what the app's `--primary` resolves to. */
  button: string;
  /** Text on `button` (AA). */
  buttonInk: string;
  /** Brand-coloured text — headings, links, labels — AA on white. */
  brandText: string;
  /** The theme's heading font family, or `null` on the platform palette. */
  headingFont: string | null;
}

function upper(value: string): string {
  return value.toUpperCase();
}

/**
 * Literal-colour brand values for a plan-resolved theme (`resolveSchoolTheme`),
 * or the platform palette for `null`. Mirrors `deriveBrandOutputs()` in
 * `lib/themes/brand-outputs.ts`, trimmed to the fields widgets use.
 */
export function deriveWidgetBrand(theme: StoredKitTheme | null): WidgetBrandOutputs {
  const themeId = theme?.theme ?? null;
  const brand = themeId ? normalizeKitBrand(themeId, theme?.brand) : PLATFORM_BRAND_HEX;

  const btn = readableButton(brand, { dark: false, lightInk: LIGHT_INK_HEX, darkInk: DARK_INK_HEX });
  const tint = upper(mixOklch(BRAND_PAPER, brand, 0.12) ?? BRAND_PAPER);
  const brandText = upper(accentTextOn(brand, [BRAND_PAPER, tint]));
  const headingFont = themeId ? KIT_HEADING_FONT[KIT_THEME_META[themeId].typePairing] : null;

  return {
    themeId,
    brand,
    button: upper(btn.background),
    buttonInk: upper(btn.ink),
    brandText,
    headingFont,
  };
}
