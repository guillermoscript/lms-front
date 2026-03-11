'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { CURATED_PRESETS, RADIUS_OPTIONS, FONT_OPTIONS } from '@/lib/themes/presets'
import { applyCuratedPreset, updateRadius, updateFont } from '@/app/actions/admin/theme'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { IconCheck, IconDice } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface OnboardingAppearanceStepProps {
  onComplete: () => void
  onBack: () => void
}

export function OnboardingAppearanceStep({ onComplete, onBack }: OnboardingAppearanceStepProps) {
  const t = useTranslations('onboarding.branding')
  const [pending, startTransition] = useTransition()
  const [activeTheme, setActiveTheme] = useState<string>('default')
  const [activeRadius, setActiveRadius] = useState('0.625rem')
  const [activeFont, setActiveFont] = useState('Noto Sans')

  function handleTheme(presetId: string) {
    setActiveTheme(presetId)
    startTransition(async () => {
      const result = await applyCuratedPreset(presetId)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to apply theme')
        setActiveTheme('default')
      }
    })
  }

  function handleRadius(radius: string) {
    setActiveRadius(radius)
    startTransition(async () => {
      const result = await updateRadius(radius)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to update radius')
        setActiveRadius('0.625rem')
      }
    })
  }

  function handleFont(fontFamily: string) {
    setActiveFont(fontFamily)
    startTransition(async () => {
      const result = await updateFont(fontFamily)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to update font')
        setActiveFont('Noto Sans')
      }
    })
  }

  function handleShuffle() {
    const randomPreset = CURATED_PRESETS[Math.floor(Math.random() * CURATED_PRESETS.length)]
    const randomFont = FONT_OPTIONS[Math.floor(Math.random() * FONT_OPTIONS.length)]
    const randomRadius = RADIUS_OPTIONS[Math.floor(Math.random() * RADIUS_OPTIONS.length)]

    setActiveTheme(randomPreset.id)
    setActiveFont(randomFont.value)
    setActiveRadius(randomRadius.value)

    startTransition(async () => {
      const [themeResult, fontResult, radiusResult] = await Promise.all([
        applyCuratedPreset(randomPreset.id),
        updateFont(randomFont.value),
        updateRadius(randomRadius.value),
      ])

      if (!themeResult.success || !fontResult.success || !radiusResult.success) {
        toast.error('Some changes failed — try again')
      } else {
        toast.success(`${randomPreset.name} + ${randomFont.label} + ${randomRadius.label}`)
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Shuffle */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleShuffle}
          disabled={pending}
          size="sm"
          variant="outline"
          className="gap-2 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800"
        >
          <IconDice className="h-4 w-4" />
          {t('shuffle')}
        </Button>
        <p className="text-xs text-zinc-500">{t('shuffleHint')}</p>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Color Themes */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-zinc-300">{t('colorTheme')}</Label>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
          {CURATED_PRESETS.map((preset) => {
            const isActive = activeTheme === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => handleTheme(preset.id)}
                disabled={pending}
                className={cn(
                  'group relative flex flex-col gap-1 rounded-lg border p-2 text-left transition-all',
                  isActive
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600',
                  pending && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div className="flex gap-0.5">
                  {preset.previewColors.map((color, i) => (
                    <span
                      key={i}
                      className="h-3 w-3 rounded-full border border-white/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium text-zinc-400">{preset.name}</span>
                  {isActive && <IconCheck className="h-2.5 w-2.5 text-blue-400" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Border Radius */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-zinc-300">{t('borderRadius')}</Label>
        <div className="flex flex-wrap gap-1.5">
          {RADIUS_OPTIONS.map((opt) => {
            const isActive = activeRadius === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => handleRadius(opt.value)}
                disabled={pending}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-2.5 py-1.5 transition-all',
                  isActive
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600',
                  pending && 'opacity-60 cursor-not-allowed'
                )}
              >
                <div
                  className="h-6 w-9 border-2 border-zinc-500 bg-zinc-800"
                  style={{ borderRadius: opt.value === '0' ? '0px' : opt.value }}
                />
                <span className="text-[10px] font-medium text-zinc-400">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Font Family */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-zinc-300">{t('font')}</Label>
        <div className="flex flex-wrap gap-1.5">
          {FONT_OPTIONS.slice(0, 8).map((font) => {
            const isActive = activeFont === font.value
            return (
              <button
                key={font.value}
                onClick={() => handleFont(font.value)}
                disabled={pending}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-all',
                  isActive
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300 ring-1 ring-blue-500'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600',
                  pending && 'opacity-60 cursor-not-allowed'
                )}
              >
                {font.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-3 border-t border-zinc-800">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-zinc-400 hover:text-white"
          disabled={pending}
        >
          <ArrowLeft className="mr-2 w-4 h-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onComplete}
          className="bg-blue-600 hover:bg-blue-500 text-white"
          disabled={pending}
        >
          {t('next')}
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
