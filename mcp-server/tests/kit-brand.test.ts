import { describe, expect, it } from "vitest";
import {
  deriveWidgetBrand,
  parseStoredKitTheme,
  resolveSchoolTheme,
  type StoredKitTheme,
} from "../views/shared/kit-brand";

/**
 * Theme kit brand derivation for widgets (issue #779).
 *
 * `deriveWidgetBrand()` mirrors `deriveBrandOutputs()` in
 * `lib/themes/brand-outputs.ts` — these fixtures were cross-checked against
 * that function (`npx tsx -e "import { deriveBrandOutputs } from
 * './lib/themes/brand-outputs'; ..."` from the repo root) and pin the values
 * so the two cannot silently drift, the same way `contrast.test.ts` covers
 * `views/shared/contrast.ts`.
 */

describe("deriveWidgetBrand", () => {
  it("falls back to the platform teal when there is no kit", () => {
    const out = deriveWidgetBrand(null);
    expect(out).toEqual({
      themeId: null,
      brand: "#007595",
      button: "#007595",
      buttonInk: "#FCFCFC",
      brandText: "#00637F",
      headingFont: null,
    });
  });

  it("derives Estructura's recommended swatch and heading font", () => {
    const theme: StoredKitTheme = { type: "kit", theme: "estructura", brand: "#3A50B8" };
    expect(deriveWidgetBrand(theme)).toEqual({
      themeId: "estructura",
      brand: "#3A50B8",
      button: "#3A50B8",
      buttonInk: "#FCFCFC",
      brandText: "#3A50B8",
      headingFont: "Instrument Sans",
    });
  });

  it("derives Andina and Luz with their own heading fonts", () => {
    expect(
      deriveWidgetBrand({ type: "kit", theme: "andina", brand: "#2F6B4F" })
    ).toMatchObject({ button: "#2F6B4F", headingFont: "Lora" });
    expect(
      deriveWidgetBrand({ type: "kit", theme: "luz", brand: "#C2185B" })
    ).toMatchObject({ button: "#C2185B", headingFont: "Outfit" });
  });

  it("derives Kódigo (a dark-surface theme) with a dark button ink", () => {
    const theme: StoredKitTheme = { type: "kit", theme: "kodigo", brand: "#F2B705" };
    expect(deriveWidgetBrand(theme)).toEqual({
      themeId: "kodigo",
      brand: "#F2B705",
      button: "#F2B705",
      buttonInk: "#11161F",
      brandText: "#856503",
      headingFont: "Noto Sans",
    });
  });

  it("shifts brandText, not button, for a near-white custom brand", () => {
    const theme: StoredKitTheme = { type: "kit", theme: "estructura", brand: "#FFFFFF" };
    const out = deriveWidgetBrand(theme);
    // The button itself is legible either way (dark ink clears AA on white),
    // so it stays put; brandText (white-on-white as text) has to move.
    expect(out.button).toBe("#FFFFFF");
    expect(out.buttonInk).toBe("#11161F");
    expect(out.brandText).toBe("#666666");
  });
});

describe("resolveSchoolTheme", () => {
  const stored = { type: "kit", theme: "estructura", brand: "#FF00FF" };

  it("keeps a custom brand colour when the plan has custom_branding", () => {
    expect(resolveSchoolTheme(stored, { customBranding: true })).toEqual({
      type: "kit",
      theme: "estructura",
      brand: "#FF00FF",
    });
  });

  it("falls back to the theme's recommended swatch without custom_branding", () => {
    expect(resolveSchoolTheme(stored, { customBranding: false })).toEqual({
      type: "kit",
      theme: "estructura",
      brand: "#3A50B8",
    });
  });

  it("returns null for anything that isn't a valid stored kit theme", () => {
    expect(resolveSchoolTheme(null, { customBranding: true })).toBeNull();
    expect(resolveSchoolTheme({ type: "legacy" }, { customBranding: true })).toBeNull();
    expect(
      resolveSchoolTheme({ type: "kit", theme: "not-a-theme", brand: "#000000" }, { customBranding: true })
    ).toBeNull();
  });
});

describe("parseStoredKitTheme", () => {
  it("uppercases a valid hex brand", () => {
    expect(parseStoredKitTheme({ type: "kit", theme: "luz", brand: "#c2185b" })).toEqual({
      type: "kit",
      theme: "luz",
      brand: "#C2185B",
    });
  });

  it("rejects a malformed brand or unknown theme", () => {
    expect(parseStoredKitTheme({ type: "kit", theme: "luz", brand: "not-a-colour" })).toBeNull();
    expect(parseStoredKitTheme({ type: "kit", theme: "nope", brand: "#C2185B" })).toBeNull();
    expect(parseStoredKitTheme(undefined)).toBeNull();
  });
});
