'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { CURATED_PRESETS, RADIUS_OPTIONS, FONT_OPTIONS } from '@/lib/themes/presets'
import type { StoredPreset } from '@/lib/themes/presets'
import { applyCuratedPreset, applyCustomPreset, resetThemePreset, updateRadius, updateFont } from '@/app/actions/admin/theme'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { IconCheck, IconRefresh, IconPalette, IconCode, IconDice } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface ThemePresetSelectorProps {
  activePreset: StoredPreset | null
}

export function ThemePresetSelector({ activePreset }: ThemePresetSelectorProps) {
  const t = useTranslations('dashboard.admin.appearance.theme')
  const [pending, startTransition] = useTransition()
  const [customCode, setCustomCode] = useState('')
  const [optimisticActive, setOptimisticActive] = useState<string | null>(
    activePreset?.id ?? null
  )
  const [activeRadius, setActiveRadius] = useState(
    activePreset?.radius ?? '0.625rem'
  )
  const [activeFont, setActiveFont] = useState(
    activePreset?.fontFamily ?? 'Noto Sans'
  )

  function handleCurated(presetId: string) {
    setOptimisticActive(presetId)
    startTransition(async () => {
      const result = await applyCuratedPreset(presetId)
      if (!result.success) {
        toast.error(result.error ?? t('applyFailed'))
        setOptimisticActive(activePreset?.id ?? null)
      } else {
        toast.success(t('applySuccess'))
      }
    })
  }

  function handleCustom() {
    const code = customCode.trim()
    if (!code) return
    startTransition(async () => {
      const result = await applyCustomPreset(code)
      if (!result.success) {
        toast.error(result.error ?? t('customApplyFailed'))
      } else {
        setOptimisticActive(`custom-${code}`)
        setCustomCode('')
        toast.success(t('customApplySuccess'))
      }
    })
  }

  function handleRadius(radius: string) {
    setActiveRadius(radius)
    startTransition(async () => {
      const result = await updateRadius(radius)
      if (!result.success) {
        toast.error(result.error ?? t('radiusFailed'))
        setActiveRadius(activePreset?.radius ?? '0.625rem')
      } else {
        toast.success(t('radiusSuccess'))
      }
    })
  }

  function handleFont(fontFamily: string) {
    setActiveFont(fontFamily)
    startTransition(async () => {
      const result = await updateFont(fontFamily)
      if (!result.success) {
        toast.error(result.error ?? t('fontFailed'))
        setActiveFont(activePreset?.fontFamily ?? 'Noto Sans')
      } else {
        toast.success(t('fontSuccess'))
      }
    })
  }

  function handleReset() {
    startTransition(async () => {
      const result = await resetThemePreset()
      if (!result.success) {
        toast.error(result.error ?? t('resetFailed'))
      } else {
        setOptimisticActive('default')
        setActiveRadius('0.625rem')
        setActiveFont('Noto Sans')
        toast.success(t('resetSuccess'))
      }
    })
  }

  function handleShuffle() {
    const randomPreset = CURATED_PRESETS[Math.floor(Math.random() * CURATED_PRESETS.length)]
    const randomFont = FONT_OPTIONS[Math.floor(Math.random() * FONT_OPTIONS.length)]
    const randomRadius = RADIUS_OPTIONS[Math.floor(Math.random() * RADIUS_OPTIONS.length)]

    setOptimisticActive(randomPreset.id)
    setActiveFont(randomFont.value)
    setActiveRadius(randomRadius.value)

    startTransition(async () => {
      const [themeResult, fontResult, radiusResult] = await Promise.all([
        applyCuratedPreset(randomPreset.id),
        updateFont(randomFont.value),
        updateRadius(randomRadius.value),
      ])

      if (!themeResult.success || !fontResult.success || !radiusResult.success) {
        toast.error(t('shuffleFailed'))
        setOptimisticActive(activePreset?.id ?? null)
        setActiveFont(activePreset?.fontFamily ?? 'Noto Sans')
        setActiveRadius(activePreset?.radius ?? '0.625rem')
      } else {
        toast.success(
          t('shuffleSuccess', {
            theme: randomPreset.name,
            font: randomFont.label,
            radius: randomRadius.label,
          })
        )
      }
    })
  }

  const isCustomActive = optimisticActive?.startsWith('custom-')

  return (
    <div className="space-y-6">
      {/* Shuffle button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleShuffle}
          disabled={pending}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <IconDice className="h-4 w-4" />
          {t('shuffle')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t('shuffleHint')}
        </p>
      </div>

      <Separator />

      {/* Curated presets grid */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t('colorTheme')}</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {CURATED_PRESETS.map((preset) => {
            const isActive = optimisticActive === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => handleCurated(preset.id)}
                disabled={pending}
                className={cn(
                  'group relative flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-all',
                  'hover:border-primary/60 hover:shadow-sm',
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card',
                  pending && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div className="flex gap-1">
                  {preset.previewColors.map((color, i) => (
                    <span
                      key={i}
                      className="h-4 w-4 rounded-full border border-black/10 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium">{preset.name}</span>
                  {isActive && (
                    <IconCheck className="h-3 w-3 shrink-0 text-primary" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <Separator />

      {/* Border Radius */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t('borderRadius')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('borderRadiusHint')}
        </p>
        <div className="flex flex-wrap gap-2">
          {RADIUS_OPTIONS.map((opt) => {
            const isActive = activeRadius === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => handleRadius(opt.value)}
                disabled={pending}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-all',
                  'hover:border-primary/60 hover:shadow-sm',
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card',
                  pending && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div
                  className="h-8 w-12 border-2 border-foreground/30 bg-muted"
                  style={{ borderRadius: opt.value === '0' ? '0px' : opt.value }}
                />
                <span className="text-[10px] font-medium">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Separator />

      {/* Font Family */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t('fontFamily')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('fontFamilyHint')}
        </p>
        {(['Sans', 'Serif'] as const).map((category) => (
          <div key={category} className="space-y-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {category}
            </span>
            <div className="flex flex-wrap gap-2">
              {FONT_OPTIONS.filter((f) => f.category === category).map((font) => {
                const isActive = activeFont === font.value
                return (
                  <button
                    key={font.value}
                    onClick={() => handleFont(font.value)}
                    disabled={pending}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                      'hover:border-primary/60 hover:shadow-sm',
                      isActive
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-card',
                      pending && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    {font.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <Separator />

      {/* Custom preset by code */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <IconCode className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">{t('customCode')}</Label>
          {isCustomActive && (
            <Badge variant="secondary" className="text-[10px]">
              {t('customCodeActive', { code: activePreset?.presetCode ?? '' })}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t.rich('customCodeHint', {
            link: (chunks) => (
              <a
                href="https://ui.shadcn.com/create"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder={t('customCodePlaceholder')}
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            className="font-mono text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCustom()}
            disabled={pending}
          />
          <Button
            onClick={handleCustom}
            disabled={!customCode.trim() || pending}
            size="sm"
            className="shrink-0"
          >
            <IconPalette className="h-4 w-4" />
            {t('apply')}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Reset */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t('resetTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('resetDescription')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={pending || optimisticActive === 'default'}
        >
          <IconRefresh className="h-4 w-4" />
          {t('reset')}
        </Button>
      </div>
    </div>
  )
}
