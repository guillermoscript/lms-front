'use client'

/**
 * Live theme preview (critique E4). The AI's `preview_theme` tool streams a
 * `data-theme-preview` part; the canvas re-scopes the theme kit's CSS variables to it, in the
 * current light/dark mode, without touching the rest of the dashboard. Nothing is saved until
 * the admin presses "Apply theme", which runs the existing `applyKitTheme` server action (its
 * plan gate for custom colours applies as-is).
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconPalette } from '@tabler/icons-react'
import type { ThemePreview } from '@lms/core'
import { Button } from '@/components/ui/button'
import { applyKitTheme } from '@/app/actions/admin/theme'
import { KIT_THEMES, deriveKitStructure, deriveKitVars, isKitSwatch, isKitThemeId } from '@/lib/themes/kit'
import { usePageArchitectContext } from './page-architect-context'

/** The CSS variables for a preview in one mode (colours + type + corners). */
export function themePreviewVars(preview: ThemePreview, mode: 'light' | 'dark'): CSSProperties {
  const colours = deriveKitVars(preview.preset, preview.primary)[mode]
  return { ...colours, ...deriveKitStructure(preview.preset) } as CSSProperties
}

/** Puck `overrides.preview`: wraps the canvas content in the previewed variables. */
export function ThemePreviewScope({ children }: { children?: ReactNode }) {
  const { themePreview } = usePageArchitectContext()
  const { resolvedTheme } = useTheme()
  if (!themePreview) return <>{children}</>
  const mode = resolvedTheme === 'dark' ? 'dark' : 'light'
  return (
    <div
      data-theme-preview={themePreview.preset}
      className="min-h-full bg-background text-foreground"
      style={themePreviewVars(themePreview, mode)}
    >
      {children}
    </div>
  )
}

/** The bar in the panel: what is previewed, Apply / Discard. */
export function ThemePreviewBar() {
  const t = useTranslations('pageArchitect.panel.theme')
  const router = useRouter()
  const { themePreview, setThemePreview } = usePageArchitectContext()
  const [applying, setApplying] = useState(false)
  if (!themePreview) return null

  const name = isKitThemeId(themePreview.preset) ? KIT_THEMES[themePreview.preset].name : themePreview.preset
  const custom = isKitThemeId(themePreview.preset) && !isKitSwatch(themePreview.preset, themePreview.primary)

  async function apply(preview: ThemePreview) {
    setApplying(true)
    try {
      const result = await applyKitTheme({ theme: preview.preset, brand: preview.primary })
      if (!result.success) {
        toast.error(result.error || t('failed'))
        return
      }
      toast.success(t('applied'))
      setThemePreview(null)
      // The school's variables live on :root (layout); refresh to pick up the saved theme.
      router.refresh()
    } catch {
      toast.error(t('failed'))
    } finally {
      setApplying(false)
    }
  }

  return (
    <section
      aria-label={t('title')}
      className="mx-3 mt-3 grid gap-2 rounded-lg border bg-card p-3 text-sm"
      data-testid="page-architect-theme-preview"
    >
      <div className="flex items-center gap-2">
        <span
          className="size-4 shrink-0 rounded-full border"
          style={{ backgroundColor: themePreview.primary }}
          aria-hidden
        />
        <IconPalette className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 font-medium">{t('title')}</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('body', { theme: name, color: themePreview.primary })}
        {custom ? ` ${t('customNote')}` : ''}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setThemePreview(null)} disabled={applying}>
          {t('discard')}
        </Button>
        <Button size="sm" onClick={() => void apply(themePreview)} disabled={applying}>
          {applying ? t('applying') : t('apply')}
        </Button>
      </div>
    </section>
  )
}
