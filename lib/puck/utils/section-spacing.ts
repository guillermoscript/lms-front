import type { Fields } from '@measured/puck'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import {
  type SectionStyleProps,
  ANCHOR_SCROLL_CLASS,
  alignClass,
  hideOnClass,
  normalizeAnchorId,
  sectionStyleDefaults,
  toneInnerStyle,
  toneOuterStyle,
} from './section-style'

/**
 * The shared section layer every spaced landing block renders through:
 * spacing tokens (padding, margin, width) plus the style tokens from
 * `./section-style` (tone, align, anchorId, hideOn). A block spreads
 * `sectionSpacingFields` / `sectionSpacingDefaults` and renders
 *
 *   <div {...sectionOuterProps(props)}>
 *     <div {...sectionInnerProps(props, accentVars(accentColor))}>…</div>
 *   </div>
 *
 * — the two wrappers it already had, never an extra `<section>` (a wrapper
 * would trap the sticky Header, which is why Header/Footer never use this).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SectionSpacingProps = {
  paddingY: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  paddingX: 'none' | 'sm' | 'md' | 'lg'
  maxWidth: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  marginY: 'none' | 'sm' | 'md' | 'lg' | 'xl'
} & SectionStyleProps

// ─── Fields (spread into component fields) ──────────────────────────────────

export const sectionSpacingFields: Fields<SectionSpacingProps> = {
  paddingY: {
    type: 'select',
    label: 'Vertical Padding',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
      { label: 'Extra Large', value: 'xl' },
    ],
  },
  paddingX: {
    type: 'select',
    label: 'Horizontal Padding',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
    ],
  },
  maxWidth: {
    type: 'select',
    label: 'Content Width',
    options: [
      { label: 'Full', value: 'full' },
      { label: 'Small (640px)', value: 'sm' },
      { label: 'Medium (768px)', value: 'md' },
      { label: 'Large (1024px)', value: 'lg' },
      { label: 'XL (1280px)', value: 'xl' },
      { label: 'None', value: 'none' },
    ],
  },
  marginY: {
    type: 'select',
    label: 'Vertical Margin',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
      { label: 'Extra Large', value: 'xl' },
    ],
  },
  tone: {
    type: 'select',
    label: 'Section Tone',
    options: [
      { label: 'Default', value: 'default' },
      { label: 'Muted', value: 'muted' },
      { label: 'Brand tint', value: 'brand-tint' },
      { label: 'Brand', value: 'brand' },
      { label: 'Inverse', value: 'inverse' },
    ],
  },
  align: {
    type: 'radio',
    label: 'Section Alignment',
    options: [
      { label: 'Default', value: 'default' },
      { label: 'Start', value: 'start' },
      { label: 'Center', value: 'center' },
    ],
  },
  anchorId: { type: 'text', label: 'Anchor ID' },
  hideOn: {
    type: 'select',
    label: 'Hide On',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Mobile', value: 'mobile' },
      { label: 'Desktop', value: 'desktop' },
    ],
  },
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const sectionSpacingDefaults: SectionSpacingProps = {
  paddingY: 'lg',
  paddingX: 'md',
  maxWidth: 'xl',
  marginY: 'none',
  ...sectionStyleDefaults,
}

// ─── Class maps ─────────────────────────────────────────────────────────────

const paddingYMap: Record<string, string> = {
  none: '',
  sm: 'py-4',
  md: 'py-8',
  lg: 'py-12',
  xl: 'py-20',
}

const paddingXMap: Record<string, string> = {
  none: '',
  sm: 'px-4',
  md: 'px-6',
  lg: 'px-8',
}

const maxWidthMap: Record<string, string> = {
  none: '',
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  full: '',
}

const marginYMap: Record<string, string> = {
  none: '',
  sm: 'my-4',
  md: 'my-8',
  lg: 'my-12',
  xl: 'my-20',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Outer wrapper classes (padding + margin + hideOn). Prefer `sectionOuterProps`. */
export function sectionOuterClass(props: Partial<SectionSpacingProps>): string {
  const py = props.paddingY ?? sectionSpacingDefaults.paddingY
  const px = props.paddingX ?? sectionSpacingDefaults.paddingX
  const my = props.marginY ?? sectionSpacingDefaults.marginY
  return cn(
    paddingYMap[py] || '',
    paddingXMap[px] || '',
    marginYMap[my] || '',
    hideOnClass(props.hideOn),
  )
}

/** Inner wrapper classes (max-width + centering + align). Prefer `sectionInnerProps`. */
export function sectionInnerClass(props: Partial<SectionSpacingProps>): string {
  const mw = maxWidthMap[props.maxWidth ?? sectionSpacingDefaults.maxWidth]
  return cn(mw ? cn(mw, 'mx-auto') : '', alignClass(props.align))
}

/** The block's DOM id: its anchorId, normalised to a slug, or none. */
export function sectionAnchorId(props: Partial<SectionSpacingProps>): string | undefined {
  return normalizeAnchorId(props.anchorId)
}

type WrapperProps = {
  id?: string
  className: string
  style?: CSSProperties
  'data-tone'?: string
}

/**
 * Props for a spaced block's OUTER wrapper: spacing, hideOn, the anchor id
 * and the tone's fill + variable captures (see `./section-style`). Pages get
 * type-based anchors (`#faq`, `#pricing`…) from `withDefaultAnchors()` at
 * render time, never here: a block cannot know whether it is the first of its
 * type, and duplicate DOM ids break label/anchor association.
 */
export function sectionOuterProps(
  props: Partial<SectionSpacingProps>,
  opts: { className?: string; style?: CSSProperties } = {},
): WrapperProps {
  const id = sectionAnchorId(props)
  const tone = toneOuterStyle(props.tone)
  const style = tone || opts.style ? { ...opts.style, ...tone } : undefined
  return {
    ...(id ? { id } : {}),
    className: cn(sectionOuterClass(props), id && ANCHOR_SCROLL_CLASS, opts.className),
    ...(style ? { style } : {}),
    ...(tone ? { 'data-tone': props.tone } : {}),
  }
}

/**
 * Props for a spaced block's INNER wrapper: width, align, and the tone's
 * re-scoped theme variables. Pass the block's `accentVars(accentColor)` as
 * `style` here (not on the outer wrapper) so the accent reads the re-scoped
 * `--primary` / `--brand-text` of a brand or inverse section.
 */
export function sectionInnerProps(
  props: Partial<SectionSpacingProps>,
  style?: CSSProperties,
  className?: string,
): WrapperProps {
  const tone = toneInnerStyle(props.tone)
  const merged = tone || style ? { ...tone, ...style } : undefined
  return {
    className: cn(sectionInnerClass(props), className),
    ...(merged ? { style: merged } : {}),
  }
}

