'use client'

import { useMemo, useSyncExternalStore, type ComponentProps, type CSSProperties } from 'react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { useTenant } from '@/components/tenant/tenant-provider'
import { deriveKitStructure, deriveKitVars, kitDefaultMode, type KitThemeId } from '@/lib/themes/kit'
import { cn } from '@/lib/utils'

export type KitPreviewMode = 'light' | 'dark'

export interface KitPreviewProps {
  theme: KitThemeId
  brand: string
  mode: KitPreviewMode
  className?: string
}

const subscribeNever = () => () => {}

/**
 * The mode a preview renders in. A dark-default theme (Kódigo) shows its dark
 * half, which is what students first see; the others follow the viewer's own
 * light/dark choice. next-themes has no resolved theme during SSR and
 * hydration, so both render light and cannot mismatch.
 */
export function useKitPreviewMode(theme: KitThemeId): KitPreviewMode {
  const { resolvedTheme } = useTheme()
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)
  if (kitDefaultMode(theme) === 'dark') return 'dark'
  return hydrated && resolvedTheme === 'dark' ? 'dark' : 'light'
}

/** The school name and its initial for the sample pages; a fallback outside a tenant. */
export function usePreviewSchool(): { name: string; initial: string } {
  const tenant = useTenant()
  const t = useTranslations('themeKit.preview')
  const name = tenant?.name?.trim() || t('schoolFallback')
  return { name, initial: name.charAt(0).toLocaleUpperCase() }
}

interface ThemeKitPreviewProps extends Omit<ComponentProps<'div'>, 'style'> {
  theme: KitThemeId
  brand: string
  mode: KitPreviewMode
}

/**
 * Renders its children in a kit theme without saving anything. It sets the
 * variables `TenantCssVarsServer` writes on `:root` on this element instead,
 * through React's style prop, so every token utility inside (`bg-primary`,
 * `rounded-button`, the heading rule, …) resolves to the picked theme. The font
 * and colours are declared again here because the page's own values were
 * resolved on `<html>` and only inherit as finished values. `dark` switches the
 * subtree's dark variants when the preview mode differs from the page's.
 */
export function ThemeKitPreview({ theme, brand, mode, className, children, ...props }: ThemeKitPreviewProps) {
  const style = useMemo(
    () => ({ ...deriveKitVars(theme, brand)[mode], ...deriveKitStructure(theme) }) as CSSProperties,
    [theme, brand, mode]
  )

  return (
    <div
      {...props}
      data-kit-theme={theme}
      data-kit-mode={mode}
      className={cn(mode === 'dark' && 'dark', 'bg-background font-sans text-foreground', className)}
      style={style}
    >
      {children}
    </div>
  )
}
