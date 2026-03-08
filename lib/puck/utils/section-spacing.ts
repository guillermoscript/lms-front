import type { Fields } from '@measured/puck'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

export type SectionSpacingProps = {
  paddingY: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  paddingX: 'none' | 'sm' | 'md' | 'lg'
  maxWidth: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  marginY: 'none' | 'sm' | 'md' | 'lg' | 'xl'
}

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
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const sectionSpacingDefaults: SectionSpacingProps = {
  paddingY: 'lg',
  paddingX: 'md',
  maxWidth: 'xl',
  marginY: 'none',
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

/** Outer wrapper classes (padding + margin) */
export function sectionOuterClass(props: SectionSpacingProps): string {
  return cn(
    paddingYMap[props.paddingY] || '',
    paddingXMap[props.paddingX] || '',
    marginYMap[props.marginY] || '',
  )
}

/** Inner wrapper classes (max-width + centering) */
export function sectionInnerClass(props: SectionSpacingProps): string {
  const mw = maxWidthMap[props.maxWidth]
  return mw ? cn(mw, 'mx-auto') : ''
}
