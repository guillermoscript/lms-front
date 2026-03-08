import type { SectionStyle, SectionColors, SectionTheme, SectionPadding } from './types'

// ─── CSS sanitization ─────────────────────────────────────────────────────────

const UNSAFE_CSS_PATTERNS = [
  /url\s*\(/gi,
  /@import/gi,
  /expression\s*\(/gi,
  /behavior\s*:/gi,
  /-moz-binding\s*:/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
]

export function sanitizeCss(css: string): string {
  let sanitized = css
  for (const pattern of UNSAFE_CSS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '/* blocked */')
  }
  return sanitized
}

export const DEFAULT_SECTION_STYLE: SectionStyle = {
  theme: 'dark',
  padding: 'lg',
}

// ─── Color resolution ───────────────────────────────────────────────────────

const THEME_COLORS: Record<SectionTheme, SectionColors> = {
  dark: {
    heading: 'text-white',
    body: 'text-zinc-400',
    muted: 'text-zinc-500',
    cardBg: 'bg-zinc-900/40',
    cardBorder: 'border-zinc-800/50',
    accent: '',
    sectionBg: '',
  },
  light: {
    heading: 'text-zinc-900',
    body: 'text-zinc-600',
    muted: 'text-zinc-500',
    cardBg: 'bg-white',
    cardBorder: 'border-zinc-200',
    accent: '',
    sectionBg: 'bg-zinc-50',
  },
  primary: {
    heading: 'text-white',
    body: 'text-white/80',
    muted: 'text-white/60',
    cardBg: 'bg-white/10',
    cardBorder: 'border-white/20',
    accent: '',
    sectionBg: '',
  },
  transparent: {
    heading: 'text-white',
    body: 'text-zinc-300',
    muted: 'text-zinc-400',
    cardBg: 'bg-transparent',
    cardBorder: 'border-white/10',
    accent: '',
    sectionBg: '',
  },
}

export function resolveSectionColors(
  theme: SectionTheme = 'dark',
  accentColor?: string,
): SectionColors {
  return {
    ...THEME_COLORS[theme],
    accent: accentColor || '#3B82F6',
  }
}

// ─── Class resolution ───────────────────────────────────────────────────────

const PADDING_CLASSES: Record<SectionPadding, string> = {
  none: 'py-0',
  sm: 'py-8',
  md: 'py-12',
  lg: 'py-20',
  xl: 'py-28',
}

const MAX_WIDTH_CLASSES: Record<string, string> = {
  narrow: 'max-w-4xl',
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
  full: 'max-w-full',
}

export function resolveSectionClasses(style?: SectionStyle): {
  paddingClass: string
  maxWidthClass: string
  bgStyle: React.CSSProperties
  bgClass: string
} {
  const s = style ?? DEFAULT_SECTION_STYLE

  const paddingClass = PADDING_CLASSES[s.padding] ?? PADDING_CLASSES.lg
  const maxWidthClass = MAX_WIDTH_CLASSES[s.maxWidth ?? 'default'] ?? MAX_WIDTH_CLASSES.default

  let bgStyle: React.CSSProperties = {}
  let bgClass = ''

  if (s.theme === 'light') {
    bgClass = 'bg-zinc-50'
  }

  if (s.backgroundImage) {
    bgStyle = {
      backgroundImage: `url(${s.backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }

  return { paddingClass, maxWidthClass, bgStyle, bgClass }
}

export function resolveSectionBgStyle(
  style?: SectionStyle,
  accentColor?: string,
): React.CSSProperties {
  const s = style ?? DEFAULT_SECTION_STYLE
  const result: React.CSSProperties = {}

  if (s.theme === 'primary' && accentColor) {
    result.backgroundColor = accentColor
  }

  if (s.backgroundImage) {
    result.backgroundImage = `url(${s.backgroundImage})`
    result.backgroundSize = 'cover'
    result.backgroundPosition = 'center'
  }

  return result
}
