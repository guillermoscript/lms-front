/**
 * Readable foregrounds for author-chosen colours (issue #569).
 *
 * Landing-page blocks let an admin set any colour they like, and a block either
 * paints that colour as a surface (a hero background, a CTA button) or uses it
 * as text on one of our own neutral surfaces. Both directions need the *other*
 * colour derived from the one we were given — hardcoding `text-primary-
 * foreground` makes a pale brand colour illegible, and letting a near-black
 * accent through makes it vanish on a dark card.
 *
 * Everything here is pure maths on the colour we were handed, so it runs
 * identically on the server (where `accentVars()` builds a block's inline
 * style, and `deriveKitVars()` builds a tenant theme) and in the browser.
 * `oklch()`/`oklab()`/`lab()`/`lch()` are converted to real sRGB (issue #761):
 * the theme kit authors every surface in OKLCH, and a lightness-only grey
 * measured contrast against the wrong colour.
 *
 * ⚠️ Mirrored, deliberately, at `mcp-server/views/shared/contrast.ts`.
 * `mcp-server` is not an npm workspace of this package and its widgets are
 * bundled separately, so it cannot import from `lib/`; the landing-page-preview
 * widget already hand-mirrors `accentVars()` for the same reason. The code of
 * the two copies must stay identical (only comments may differ) —
 * `tests/unit/contrast-mirror-parity.test.ts` fails otherwise, and
 * `mcp-server/tests/contrast.test.ts` covers the shared behaviour.
 */

/** WCAG AA for normal-size text. */
export const AA_CONTRAST = 4.5;

/** Ink used on light surfaces — zinc-900, matching the widgets' own text. */
export const DARK_INK = "#18181b";
/** Ink used on dark surfaces. */
export const LIGHT_INK = "#ffffff";

/** The card surface in light mode (`--card`). */
export const CARD_LIGHT = "#ffffff";
/** The card surface in dark mode (`--card`). */
export const CARD_DARK = "#18181b";

/** An sRGB colour, each channel a float in 0..255. */
export type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3,8})$/i;
const FN = /^(rgba?|hsla?|oklch|oklab|lab|lch)\(([^)]*)\)$/i;
const HUE_UNIT = /(deg|grad|rad|turn)$/;

/**
 * The few CSS keywords worth resolving. `branding.tsx` allow-lists any bare
 * keyword, but in practice a colour picker emits hex — this covers the ones an
 * admin might type by hand, and anything else falls through to `null`.
 */
const KEYWORDS: Record<string, Rgb> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
};

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** Split a CSS function's arguments on commas and/or spaces, dropping an alpha after `/`. */
function args(body: string): string[] {
  return body
    .split("/")[0]
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
}

function num(token: string | undefined, scale = 1): number | null {
  if (!token) return null;
  const pct = token.endsWith("%");
  const n = Number.parseFloat(pct ? token.slice(0, -1) : token);
  if (!Number.isFinite(n)) return null;
  return pct ? (n / 100) * scale : n;
}

/** A Lab-family component: `none` is 0, a percentage is relative to `scale`. */
function component(token: string | undefined, scale: number): number | null {
  return token === "none" ? 0 : num(token, scale);
}

/** A CSS hue in degrees: unitless, `deg`, `rad`, `grad` or `turn`; `none` is 0. */
function hue(token: string | undefined): number | null {
  if (!token) return null;
  if (token === "none") return 0;
  const unit = HUE_UNIT.exec(token)?.[1];
  const raw = unit ? token.slice(0, -unit.length) : token;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (unit === "rad") return (n * 180) / Math.PI;
  if (unit === "grad") return n * 0.9;
  if (unit === "turn") return n * 360;
  return n;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Overflowing components (e.g. `1e308`) turn into NaN channels; treat them as unparseable. */
function finite(rgb: Rgb): Rgb | null {
  return rgb.every(Number.isFinite) ? rgb : null;
}

/** sRGB transfer function: linear light 0..1 to encoded 0..255, gamut-clipped. */
function encode(linear: number): number {
  const c = clamp(linear, 0, 1);
  return (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
}

/** Inverse sRGB transfer function: encoded 0..255 to linear light 0..1. */
function decode(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** OKLab to sRGB (Björn Ottosson's matrices), clipped per channel. */
function oklabToRgb(l: number, a: number, b: number): Rgb {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    encode(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    encode(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    encode(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/**
 * CIE Lab (D50, as CSS defines it) to sRGB: Lab → XYZ D50 → Bradford-adapted
 * XYZ D65 → linear sRGB → sRGB gamma, clipped per channel.
 */
function labToRgb(l: number, a: number, b: number): Rgb {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = (fx ** 3 > epsilon ? fx ** 3 : (116 * fx - 16) / kappa) * 0.3457 / 0.3585;
  const y = l > kappa * epsilon ? fy ** 3 : l / kappa;
  const z = (fz ** 3 > epsilon ? fz ** 3 : (116 * fz - 16) / kappa) * (1 - 0.3457 - 0.3585) / 0.3585;

  const x65 = 0.955473421488075 * x - 0.02309845494876471 * y + 0.06325924320057072 * z;
  const y65 = -0.0283697093338637 * x + 1.0099953980813041 * y + 0.021041441191917323 * z;
  const z65 = 0.012314014864481998 * x - 0.020507649298898964 * y + 1.330365926242124 * z;

  return [
    encode(3.2409699419045226 * x65 - 1.537383177570094 * y65 - 0.4986107602930034 * z65),
    encode(-0.9692436362808796 * x65 + 1.8759675015077202 * y65 + 0.04155505740717559 * z65),
    encode(0.05563007969699366 * x65 - 0.20397695888897652 * y65 + 1.0569715142428786 * z65),
  ];
}

/**
 * Parse a CSS colour into sRGB 0-255.
 *
 * `oklch`/`oklab`/`lab`/`lch` are converted for real and clipped to the sRGB
 * gamut per channel. Alpha is dropped and `none` reads as 0. Returns `null`
 * for anything unrecognised — callers fall back rather than guess.
 */
export function parseColor(css: string | null | undefined): Rgb | null {
  const v = css?.trim().toLowerCase();
  if (!v) return null;

  if (KEYWORDS[v]) return KEYWORDS[v];

  const hex = HEX.exec(v);
  if (hex) {
    const h = hex[1];
    // #rgb / #rgba expand each nibble; #rrggbb / #rrggbbaa read pairs. Alpha is
    // dropped: we cannot know what is behind it, and blocks paint opaque.
    if (h.length === 3 || h.length === 4) {
      return [
        Number.parseInt(h[0] + h[0], 16),
        Number.parseInt(h[1] + h[1], 16),
        Number.parseInt(h[2] + h[2], 16),
      ];
    }
    if (h.length === 6 || h.length === 8) {
      return [
        Number.parseInt(h.slice(0, 2), 16),
        Number.parseInt(h.slice(2, 4), 16),
        Number.parseInt(h.slice(4, 6), 16),
      ];
    }
    return null;
  }

  const fn = FN.exec(v);
  if (!fn) return null;
  const name = fn[1];
  const a = args(fn[2]);

  if (name === "rgb" || name === "rgba") {
    const r = num(a[0], 255);
    const g = num(a[1], 255);
    const b = num(a[2], 255);
    if (r === null || g === null || b === null) return null;
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  }

  if (name === "hsl" || name === "hsla") {
    const h = num(a[0], 360);
    const s = num(a[1], 1);
    const l = num(a[2], 1);
    if (h === null || s === null || l === null) return null;
    // Bare numbers for s/l are already percentages in CSS ("hsl(0 50 50)").
    const sv = a[1].endsWith("%") ? s : s / 100;
    const lv = a[2].endsWith("%") ? l : l / 100;
    return hslToRgb(h, clamp(sv, 0, 1), clamp(lv, 0, 1));
  }

  if (name === "oklab" || name === "oklch") {
    // L is 0..1 (100% = 1); chroma and a/b percentages are relative to 0.4.
    const l = component(a[0], 1);
    if (l === null) return null;
    if (name === "oklab") {
      const ca = component(a[1], 0.4);
      const cb = component(a[2], 0.4);
      if (ca === null || cb === null) return null;
      return finite(oklabToRgb(clamp(l, 0, 1), ca, cb));
    }
    const c = component(a[1], 0.4);
    const h = hue(a[2]);
    if (c === null || h === null) return null;
    return finite(oklchToRgb(l, c, h));
  }

  // lab/lch: L is 0..100 (100% = 100); a/b percentages are relative to 125,
  // chroma percentages to 150.
  const l = component(a[0], 100);
  if (l === null) return null;
  if (name === "lab") {
    const ca = component(a[1], 125);
    const cb = component(a[2], 125);
    if (ca === null || cb === null) return null;
    return finite(labToRgb(clamp(l, 0, 100), ca, cb));
  }
  const c = component(a[1], 150);
  const h = hue(a[2]);
  if (c === null || h === null) return null;
  const rad = (h * Math.PI) / 180;
  const chroma = Math.max(0, c);
  return finite(labToRgb(clamp(l, 0, 100), chroma * Math.cos(rad), chroma * Math.sin(rad)));
}

/** OKLCH (L 0..1, C ≥ 0, H degrees) to sRGB 0-255, clipped per channel. */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  const chroma = Math.max(0, c);
  return oklabToRgb(clamp(l, 0, 1), chroma * Math.cos(rad), chroma * Math.sin(rad));
}

/** sRGB 0-255 to OKLCH: `[L 0..1, C ≥ 0, H degrees 0..360)`. */
export function rgbToOklch(rgb: Rgb): [number, number, number] {
  const r = decode(rgb[0]);
  const g = decode(rgb[1]);
  const b = decode(rgb[2]);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const oa = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const ob = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(oa * oa + ob * ob);
  const h = ((Math.atan2(ob, oa) * 180) / Math.PI + 360) % 360;
  return [l, c, h];
}

/** Below this chroma a colour is treated as grey: its hue is noise. */
const ACHROMATIC = 0.02;

/**
 * Mix two colours in OKLCH, returning `#rrggbb`. `t = 0` is `from`, `t = 1`
 * is `to`. Lightness and chroma move linearly; hue takes the shorter arc, and a
 * grey side borrows the other side's hue so mixing toward white or black keeps
 * the colour's own hue instead of swinging through red. `null` when either
 * input cannot be parsed.
 */
export function mixOklch(from: string, to: string, t: number): string | null {
  const fromRgb = parseColor(from);
  const toRgb = parseColor(to);
  if (!fromRgb || !toRgb) return null;
  if (t <= 0) return toHex(fromRgb);
  if (t >= 1) return toHex(toRgb);

  const [l1, c1, h1] = rgbToOklch(fromRgb);
  const [l2, c2, h2] = rgbToOklch(toRgb);
  let h: number;
  if (c1 < ACHROMATIC) {
    h = h2;
  } else if (c2 < ACHROMATIC) {
    h = h1;
  } else {
    let delta = h2 - h1;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    h = h1 + delta * t;
  }
  return toHex(oklchToRgb(l1 + (l2 - l1) * t, c1 + (c2 - c1) * t, h));
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two colours, 1 (identical) to 21 (black/white). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The ink with the highest contrast against `background`; ties go to the earlier ink. */
export function pickInk(background: string, inks: readonly string[]): string {
  let best = inks[0];
  let bestRatio = -1;
  for (const ink of inks) {
    const ratio = contrastRatio(ink, background);
    if (ratio > bestRatio) {
      best = ink;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * The ink to write with on top of `background`.
 *
 * Whichever of our two inks contrasts *more* with the surface wins, so a black
 * block gets white text and a pale-yellow block gets near-black text. This has
 * to be a real ratio comparison rather than a luminance threshold: mid-tones
 * are not symmetric, and a plain cut sends colours like green-600 (`#16a34a`)
 * to white at 3.3:1 when near-black scores 5.8:1 on the same surface.
 *
 * Two fixed inks cannot always reach AA — a surface sitting near the crossover
 * (luminance ≈ 0.2) tops out around 4.3:1 against either. There we escalate to
 * pure black or white, which is the only pair that clears 4.5:1 for every
 * possible surface, accepting a slightly harder look on the rare mid-tone.
 *
 * An unparseable colour falls back to `fallback` (white, matching what the
 * widgets assumed before) rather than guessing.
 */
export function readableOn(background: string, fallback: string = LIGHT_INK): string {
  const rgb = parseColor(background);
  if (!rgb) return fallback;

  const best =
    contrastRatio(LIGHT_INK, background) >= contrastRatio(DARK_INK, background)
      ? LIGHT_INK
      : DARK_INK;
  if (contrastRatio(best, background) >= AA_CONTRAST) return best;

  return relativeLuminance(rgb) > 0.2 ? "#000000" : "#ffffff";
}

/**
 * A filled button in `color` with legible ink — the brand keeps its ink and the
 * *button* moves, the opposite of `readableOn()`.
 *
 * When one of the two branded inks already clears AA on `color`, the colour is
 * returned untouched (the exact input string). Otherwise it is mixed in OKLCH
 * in 2% steps toward black on a light surface (paired with the light ink) or
 * toward white on a dark surface (paired with the dark ink) until the pair
 * clears AA, so the button still reads as the brand. An unparseable colour
 * comes back as-is with `readableOn()`'s fallback ink.
 */
export function readableButton(
  color: string,
  opts: { dark: boolean; lightInk: string; darkInk: string },
): { background: string; ink: string; shifted: boolean } {
  if (!parseColor(color)) {
    return { background: color, ink: readableOn(color, opts.lightInk), shifted: false };
  }

  const ink = pickInk(color, [opts.lightInk, opts.darkInk]);
  if (contrastRatio(ink, color) >= AA_CONTRAST) {
    return { background: color, ink, shifted: false };
  }

  const target = opts.dark ? "#ffffff" : "#000000";
  const shiftedInk = opts.dark ? opts.darkInk : opts.lightInk;
  for (let step = 1; step <= 50; step++) {
    const mixed = mixOklch(color, target, step / 50);
    if (mixed && contrastRatio(shiftedInk, mixed) >= AA_CONTRAST) {
      return { background: mixed, ink: shiftedInk, shifted: true };
    }
  }
  // Only reachable with inks that cannot clear AA even on pure black/white.
  return { background: target, ink: readableOn(target), shifted: true };
}

/** True when the surface is dark enough that we would write on it in white. */
export function isDarkSurface(background: string): boolean {
  const rgb = parseColor(background);
  if (!rgb) return true;
  return contrastRatio(LIGHT_INK, background) >= contrastRatio(DARK_INK, background);
}

/**
 * Fade a colour, keeping it readable-ish — the widgets' `text-white/85` idiom
 * for secondary copy, but on a derived ink rather than a hardcoded white.
 */
export function withAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/**
 * The accent, adjusted until it is legible *as text* on `surface`.
 *
 * Used where the accent itself is the type (stat numbers, a CTA label on a
 * white pill). We keep the author's colour when it already clears AA, and
 * otherwise mix it toward white or black — whichever direction moves away from
 * the surface — in small steps, so the result still reads as their colour
 * instead of snapping to a flat ink. If even the extreme fails (an accent equal
 * to the surface), the plain readable ink wins: legible beats on-brand.
 *
 * Given a list of surfaces, a candidate has to clear AA on every one of them;
 * the first surface decides the mixing direction and the fallback ink.
 */
export function accentTextOn(accent: string, surface: string | readonly string[]): string {
  const surfaces: readonly string[] = typeof surface === "string" ? [surface] : surface;
  const accentRgb = parseColor(accent);
  const surfaceRgb = parseColor(surfaces[0]);
  if (!accentRgb || !surfaceRgb) return accent;
  if (surfaces.some((s) => !parseColor(s))) return accent;

  const legible = (color: string) =>
    surfaces.every((s) => contrastRatio(color, s) >= AA_CONTRAST);
  if (legible(accent)) return accent;

  // Move away from the surface: lighten on a dark surface, darken on a light one.
  const target = relativeLuminance(surfaceRgb) > 0.45 ? [0, 0, 0] : [255, 255, 255];
  for (let pct = 15; pct <= 90; pct += 15) {
    const mixed: Rgb = [
      accentRgb[0] + (target[0] - accentRgb[0]) * (pct / 100),
      accentRgb[1] + (target[1] - accentRgb[1]) * (pct / 100),
      accentRgb[2] + (target[2] - accentRgb[2]) * (pct / 100),
    ];
    const hex = toHex(mixed);
    if (legible(hex)) return hex;
  }
  return readableOn(surfaces[0]);
}

function channel(n: number): string {
  return Math.round(clamp(n, 0, 255))
    .toString(16)
    .padStart(2, "0");
}

/** sRGB triple to `#rrggbb`. */
export function toHex(rgb: Rgb): string {
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}
