'use client'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TextField } from './editor-field'
import { IconSun, IconMoon, IconPalette, IconEyeOff } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import type { SectionStyle, SectionTheme, SectionPadding } from '@/lib/landing-pages/types'
import { DEFAULT_SECTION_STYLE } from '@/lib/landing-pages/style-utils'
import { useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'

interface Props {
  style: SectionStyle | undefined
  onChange: (style: SectionStyle) => void
}

const THEMES: { value: SectionTheme; icon: typeof IconMoon; label: string }[] = [
  { value: 'dark', icon: IconMoon, label: 'themeDark' },
  { value: 'light', icon: IconSun, label: 'themeLight' },
  { value: 'primary', icon: IconPalette, label: 'themePrimary' },
  { value: 'transparent', icon: IconEyeOff, label: 'themeTransparent' },
]

const PADDINGS: { value: SectionPadding; label: string }[] = [
  { value: 'none', label: 'paddingNone' },
  { value: 'sm', label: 'paddingSm' },
  { value: 'md', label: 'paddingMd' },
  { value: 'lg', label: 'paddingLg' },
  { value: 'xl', label: 'paddingXl' },
]

export function SectionStyleEditor({ style, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.style')
  const s = style ?? DEFAULT_SECTION_STYLE
  const [bgOpen, setBgOpen] = useState(!!s.backgroundImage)

  function update(patch: Partial<SectionStyle>) {
    onChange({ ...s, ...patch })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t('styleSection')}</h3>

      {/* Theme selector */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t('theme')}</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {THEMES.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                s.theme === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border hover:bg-accent/50 text-muted-foreground'
              }`}
              onClick={() => update({ theme: value })}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      {/* Padding */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t('padding')}</Label>
        <div className="flex gap-1">
          {PADDINGS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`flex-1 text-center px-1.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
                s.padding === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border hover:bg-accent/50 text-muted-foreground'
              }`}
              onClick={() => update({ padding: value })}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      {/* Max width */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t('maxWidth')}</Label>
        <Select value={s.maxWidth ?? 'default'} onValueChange={v => v && update({ maxWidth: v as SectionStyle['maxWidth'] })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="narrow">{t('maxWidthNarrow')}</SelectItem>
            <SelectItem value="default">{t('maxWidthDefault')}</SelectItem>
            <SelectItem value="wide">{t('maxWidthWide')}</SelectItem>
            <SelectItem value="full">{t('maxWidthFull')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Background image (collapsible) */}
      <div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setBgOpen(!bgOpen)}
        >
          {bgOpen ? <IconChevronDown className="w-3 h-3" /> : <IconChevronRight className="w-3 h-3" />}
          {t('backgroundImage')}
        </button>
        {bgOpen && (
          <div className="mt-2 space-y-3">
            <TextField
              label=""
              value={s.backgroundImage ?? ''}
              onChange={v => update({ backgroundImage: v || undefined })}
              placeholder="https://\u2026"
            />
            {s.backgroundImage && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('overlayOpacity')}</Label>
                <Slider
                  value={[s.backgroundOverlay ?? 50]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(val) => update({ backgroundOverlay: Array.isArray(val) ? val[0] : val })}
                  className="w-full"
                />
                <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                  {s.backgroundOverlay ?? 50}%
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
