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
 * Everything here is pure sRGB maths on the colour we were handed, so it runs
 * identically on the server (where `accentVars()` builds a block's inline
 * style) and in the browser.
 *
 * ⚠️ Mirrored, deliberately, at `mcp-server/resources/shared/contrast.ts`.
 * `mcp-server` is not an npm workspace of this package and its widgets are
 * bundled separately, so it cannot import from `lib/`; the landing-page-preview
 * widget already hand-mirrors `accentVars()` for the same reason. Keep the two
 * in sync — `mcp-server/tests/contrast.test.ts` covers the shared behaviour.
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

type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3,8})$/i;
const FN = /^(rgba?|hsla?|oklch|oklab|lab|lch)\(([^)]*)\)$/i;

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

/**
 * Parse a CSS colour into sRGB 0-255.
 *
 * `oklch`/`oklab`/`lab`/`lch` are approximated by their lightness channel alone
 * (a grey of the same perceptual lightness). We only ever use the result to ask
 * "is this light or dark", and full colour-space conversion is far more code
 * than that question is worth. Returns `null` for anything unrecognised —
 * callers fall back rather than guess.
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

  // oklch/oklab/lab/lch: first argument is lightness — 0..1 for the ok* forms,
  // 0..100 for lab/lch, and a percentage in either.
  const rawL = a[0];
  const l = num(rawL, 1);
  if (l === null) return null;
  const isPct = rawL.endsWith("%");
  const scale = isPct ? 1 : name === "lab" || name === "lch" ? 100 : 1;
  const lightness = clamp(isPct ? l : l / scale, 0, 1);
  const grey = lightness * 255;
  return [grey, grey, grey];
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
 */
export function accentTextOn(accent: string, surface: string): string {
  const accentRgb = parseColor(accent);
  const surfaceRgb = parseColor(surface);
  if (!accentRgb || !surfaceRgb) return accent;

  if (contrastRatio(accent, surface) >= AA_CONTRAST) return accent;

  // Move away from the surface: lighten on a dark surface, darken on a light one.
  const target = relativeLuminance(surfaceRgb) > 0.45 ? [0, 0, 0] : [255, 255, 255];
  for (let pct = 15; pct <= 90; pct += 15) {
    const mixed: Rgb = [
      accentRgb[0] + (target[0] - accentRgb[0]) * (pct / 100),
      accentRgb[1] + (target[1] - accentRgb[1]) * (pct / 100),
      accentRgb[2] + (target[2] - accentRgb[2]) * (pct / 100),
    ];
    const hex = toHex(mixed);
    if (contrastRatio(hex, surface) >= AA_CONTRAST) return hex;
  }
  return readableOn(surface);
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
