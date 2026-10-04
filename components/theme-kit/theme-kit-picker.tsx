'use client'

import { useDeferredValue, useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconCircleCheck } from '@tabler/icons-react'
import { Loader2 } from 'lucide-react'
import { applyKitTheme, resetSchoolTheme } from '@/app/actions/admin/theme'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_KIT_THEME,
  deriveKitStructure,
  isKitSwatch,
  KIT_SURFACES,
  KIT_THEME_IDS,
  KIT_THEMES,
  KIT_TYPE_PAIRINGS,
  kitButtonReadability,
  resolveSchoolTheme,
  type KitButtonReadability,
  type KitTheme,
  type KitThemeId,
  type StoredKitTheme,
} from '@/lib/themes/kit'
import { cn } from '@/lib/utils'
import { PreviewLessonPhone } from './preview-lesson-phone'
import { PreviewSchoolPage } from './preview-school-page'
import { useKitPreviewMode } from './theme-kit-preview'

export interface ThemeKitPickerProps {
  /** Stored theme from getSchoolTheme(); null = platform palette (nothing saved yet). */
  stored: StoredKitTheme | null
  /** Whether the plan includes custom_branding (custom hex allowed). */
  customBranding: boolean
  /** 'admin': panel + school page preview + phone lesson preview, custom colour entry, Reset, "Save look".
   *  'onboarding': theme + swatch only (no custom colour, no reset), phone lesson preview only (md+), footer = Back + Next. */
  variant: 'admin' | 'onboarding'
  /** onboarding only: called after Next — after a successful save when the selection changed, immediately when it did not. */
  onContinue?: () => void
  /** onboarding only. */
  onBack?: () => void
}

const THEME_OPTIONS = KIT_THEME_IDS.map((id) => {
  const kit = KIT_THEMES[id]
  const surface = KIT_SURFACES[kit.surface][kit.defaultMode === 'dark' ? 'dark' : 'light']
  return {
    kit,
    // The tile is a scrap of the theme's own page: its surface, ink and heading face.
    tile: {
      background: surface.background,
      color: surface.foreground,
      fontFamily: deriveKitStructure(id)['--font-heading'],
    },
  }
})

const READABILITY_MESSAGE: Record<KitButtonReadability, string> = {
  'light-ink': 'readability.lightInk',
  'dark-ink': 'readability.darkInk',
  'shifted-deeper': 'readability.shiftedDeeper',
  'shifted-lighter': 'readability.shiftedLighter',
}

const HEX_INPUT = /^#?([0-9a-f]{6})$/i

/** `#RRGGBB` uppercase from what an admin typed (the `#` is optional), or null. */
function parseHexInput(value: string): string | null {
  const match = HEX_INPUT.exec(value.trim())
  return match ? `#${match[1].toUpperCase()}` : null
}

function initialSelection(stored: StoredKitTheme | null, customBranding: boolean): { theme: KitThemeId; brand: string } {
  const resolved = resolveSchoolTheme(stored, { customBranding })
  if (resolved) return { theme: resolved.theme, brand: resolved.brand }
  return { theme: DEFAULT_KIT_THEME, brand: KIT_THEMES[DEFAULT_KIT_THEME].swatches[0].hex }
}

/**
 * The ARIA radio group keyboard pattern: arrows (and Home/End) move focus and
 * the selection together, Space picks the focused radio. Only the checked radio
 * is in the tab order, so the group is a single Tab stop.
 */
function onRadioGroupKeyDown(event: KeyboardEvent<HTMLElement>, pick: (index: number) => void) {
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'))
  const current = radios.indexOf(event.target as HTMLElement)
  if (current === -1) return
  const last = radios.length - 1
  let next: number
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      next = current === last ? 0 : current + 1
      break
    case 'ArrowUp':
    case 'ArrowLeft':
      next = current === 0 ? last : current - 1
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = last
      break
    case ' ':
      next = current
      break
    default:
      return
  }
  event.preventDefault()
  radios[next].focus()
  pick(next)
}

// Selection is shown by a heavier foreground edge, never by colour alone, and
// the focus outline is foreground too so it holds on any tenant palette.
const RADIO_CLASS =
  'outline-hidden transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground motion-reduce:transition-none'

// Unavailable footer buttons use aria-disabled, not disabled: a disabled button
// drops keyboard focus to the page, and Save turns unavailable the moment it is
// pressed. The handlers return early instead.
const ARIA_DISABLED_CLASS = 'aria-disabled:pointer-events-none aria-disabled:opacity-50'

export function ThemeKitPicker({ stored, customBranding, variant, onContinue, onBack }: ThemeKitPickerProps) {
  const t = useTranslations('themeKit')
  const router = useRouter()
  const baseId = useId()
  const saveRef = useRef<HTMLButtonElement>(null)

  const [initial] = useState(() => initialSelection(stored, customBranding))
  const [theme, setTheme] = useState<KitThemeId>(initial.theme)
  const [brand, setBrand] = useState(initial.brand)
  const customAllowed = variant === 'admin' && customBranding
  // A saved custom colour opens with its hex in the field, so the admin sees
  // what is live instead of six swatches with none selected.
  const [customOpen, setCustomOpen] = useState(() => customAllowed && !isKitSwatch(initial.theme, initial.brand))
  const [customInput, setCustomInput] = useState(initial.brand)
  // Whether the admin picked anything yet; only onboarding with nothing stored reads it.
  const [touched, setTouched] = useState(false)
  const [pendingAction, setPendingAction] = useState<'save' | 'reset' | null>(null)
  const [isPending, startTransition] = useTransition()

  // Each pick re-derives every preview colour; deferring the previews keeps the
  // radios and a dragged native colour input responsive.
  const previewTheme = useDeferredValue(theme)
  const previewBrand = useDeferredValue(brand)
  const mode = useKitPreviewMode(previewTheme)

  const kit = KIT_THEMES[theme]
  const customActive = customAllowed && customOpen
  const customInvalid = customActive && parseHexInput(customInput) === null
  const readability = kitButtonReadability(theme, brand)
  const swatchIndex = kit.swatches.findIndex((swatch) => swatch.hex === brand)
  // Compared against what students see, the stored row resolved against the
  // plan, so a custom colour the plan masks neither enables Save nor gets
  // overwritten by an untouched Next. With nothing stored, the admin page counts
  // saving the shown default as a real choice; onboarding writes only once
  // something was picked, so an untouched Next keeps the platform palette.
  const saved = resolveSchoolTheme(stored, { customBranding })
  const changed = saved ? saved.theme !== theme || saved.brand !== brand : variant === 'admin' || touched
  const saving = isPending && pendingAction === 'save'
  const resetting = isPending && pendingAction === 'reset'
  const saveBlocked = isPending || customInvalid || !changed

  const ids = {
    themeLabel: `${baseId}-theme`,
    colorLabel: `${baseId}-color`,
    custom: `${baseId}-custom`,
    customHex: `${baseId}-custom-hex`,
    customError: `${baseId}-custom-error`,
  }

  function themeSpec(option: KitTheme): string {
    const pairing = KIT_TYPE_PAIRINGS[option.typePairing]
    const fonts =
      pairing.heading === pairing.body ? pairing.heading : t('fontPair', { heading: pairing.heading, body: pairing.body })
    return t('spec', {
      surface: t(`surfaces.${option.surface}`),
      corners: t(`corners.${option.corners}`),
      fonts,
    })
  }

  // Re-choosing the checked option (click, Enter or Space) is a no-op: it must
  // not snap the colour back to the recommended swatch or count as a pick.
  function pickTheme(id: KitThemeId) {
    if (id === theme) return
    setTheme(id)
    setBrand(KIT_THEMES[id].swatches[0].hex)
    setCustomOpen(false)
    setTouched(true)
  }

  function pickSwatch(hex: string) {
    // A swatch matching the custom colour still closes the open custom field.
    if (hex === brand && !customOpen) return
    setBrand(hex)
    setCustomOpen(false)
    setTouched(true)
  }

  function toggleCustom() {
    if (customOpen) {
      setCustomOpen(false)
      if (!isKitSwatch(theme, brand)) setBrand(kit.swatches[0].hex)
      return
    }
    setCustomInput(brand)
    setCustomOpen(true)
  }

  function changeCustom(value: string) {
    setCustomInput(value)
    const hex = parseHexInput(value)
    if (!hex) return
    setBrand(hex)
    setTouched(true)
  }

  function save(then?: () => void) {
    setPendingAction('save')
    startTransition(async () => {
      const result = await applyKitTheme({ theme, brand })
      if (!result.success) {
        toast.error(t('saveFailed'), { description: result.error })
        return
      }
      toast.success(t('saved'))
      router.refresh()
      then?.()
    })
  }

  function saveLook() {
    if (saveBlocked) return
    save()
  }

  function handleNext() {
    if (!changed) {
      onContinue?.()
      return
    }
    save(onContinue)
  }

  function reset() {
    if (isPending) return
    setPendingAction('reset')
    startTransition(async () => {
      const result = await resetSchoolTheme()
      if (!result.success) {
        toast.error(t('resetFailed'), { description: result.error })
        return
      }
      toast.success(t('resetDone'))
      const fallback = initialSelection(null, customBranding)
      startTransition(() => {
        setTheme(fallback.theme)
        setBrand(fallback.brand)
        setCustomInput(fallback.brand)
        setCustomOpen(false)
        setTouched(false)
      })
      // Reset unmounts once the refresh reports nothing stored; hand focus to
      // Save first so a keyboard user is not dropped back to the top of the page.
      saveRef.current?.focus()
      router.refresh()
    })
  }

  const spinner = <Loader2 data-icon="inline-start" aria-hidden className="animate-spin motion-reduce:animate-none" />

  // Without it the pre-selected card reads as the look students already see.
  const platformDefaultStatus =
    stored === null ? (
      <p data-testid="theme-kit-status" className="text-xs/relaxed text-muted-foreground">
        {t('platformDefault')}
      </p>
    ) : null

  const themeGroup = (
    <div className="flex flex-col gap-2.5">
      <span id={ids.themeLabel} className="text-sm font-semibold">
        {t('themeLabel')}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={ids.themeLabel}
        className="flex flex-col gap-2"
        onKeyDown={(event) => onRadioGroupKeyDown(event, (index) => pickTheme(KIT_THEME_IDS[index]))}
      >
        {THEME_OPTIONS.map(({ kit: option, tile }) => {
          const checked = option.id === theme
          const nameId = `${baseId}-theme-${option.id}-name`
          const specId = `${baseId}-theme-${option.id}-spec`
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-labelledby={nameId}
              aria-describedby={specId}
              tabIndex={checked ? 0 : -1}
              data-testid={`theme-kit-theme-${option.id}`}
              onClick={() => pickTheme(option.id)}
              className={cn(
                RADIO_CLASS,
                'flex min-h-15 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left',
                checked ? 'border-foreground ring-1 ring-foreground' : 'border-border'
              )}
            >
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-lg font-bold ring-1 ring-foreground/10"
                style={tile}
              >
                Aa
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id={nameId} className="text-sm font-semibold">
                  {option.name}
                </span>
                <span id={specId} className="text-xs text-muted-foreground">
                  {themeSpec(option)}
                </span>
              </span>
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full ring-1 ring-foreground/10"
                style={{ background: option.swatches[0].hex }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )

  const colorGroup = (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span id={ids.colorLabel} className="text-sm font-semibold">
          {t('colorLabel')}
        </span>
        <span className="text-xs text-muted-foreground">{t('colorFor', { theme: kit.name })}</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={ids.colorLabel}
        className="grid grid-cols-3 gap-2"
        onKeyDown={(event) => onRadioGroupKeyDown(event, (index) => pickSwatch(kit.swatches[index].hex))}
      >
        {kit.swatches.map((swatch, index) => {
          const checked = index === swatchIndex
          return (
            <button
              key={swatch.hex}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (swatchIndex === -1 && index === 0) ? 0 : -1}
              data-testid={`theme-kit-swatch-${swatch.hex.slice(1).toUpperCase()}`}
              onClick={() => pickSwatch(swatch.hex)}
              className={cn(
                RADIO_CLASS,
                'flex min-w-0 flex-col items-center gap-1.5 rounded-lg border-2 px-1 pt-2.5 pb-2 text-center',
                checked ? 'border-foreground' : 'border-transparent'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-11 shrink-0 ring-1 ring-foreground/10 ring-inset',
                  kit.corners === 'sharp' ? 'rounded-[2px]' : 'rounded-full'
                )}
                style={{ background: swatch.hex }}
              />
              <span className="text-xs font-medium">{swatch.name}</span>
              <span className="min-h-3.5 text-[0.625rem] leading-3.5 text-muted-foreground">
                {index === 0 ? t('recommended') : null}
              </span>
            </button>
          )
        })}
      </div>
      <p
        data-testid="theme-kit-readability"
        data-readability={readability}
        aria-live="polite"
        className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs/relaxed"
      >
        <IconCircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{t(READABILITY_MESSAGE[readability])}</span>
      </p>
    </div>
  )

  const customSection =
    variant === 'admin' ? (
      <div data-testid="theme-kit-custom-color" className="flex flex-col gap-3">
        {customBranding ? (
          <>
            <button
              type="button"
              data-testid="theme-kit-custom-toggle"
              aria-expanded={customOpen}
              aria-controls={customOpen ? ids.custom : undefined}
              onClick={toggleCustom}
              className="self-start rounded-sm text-xs font-medium text-foreground underline underline-offset-4 outline-hidden hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground"
            >
              {customOpen ? t('custom.close') : t('custom.open')}
            </button>
            {customOpen ? (
              <Field id={ids.custom} data-invalid={customInvalid || undefined}>
                <FieldLabel htmlFor={ids.customHex}>{t('custom.label')}</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('custom.pickerLabel')}
                    value={brand.toLowerCase()}
                    onChange={(event) => changeCustom(event.target.value)}
                    className="size-8 shrink-0 cursor-pointer rounded-input border border-input bg-transparent p-0.5"
                  />
                  <Input
                    id={ids.customHex}
                    data-testid="theme-kit-custom-hex"
                    value={customInput}
                    onChange={(event) => changeCustom(event.target.value)}
                    placeholder="#3A50B8"
                    maxLength={7}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={customInvalid || undefined}
                    aria-describedby={customInvalid ? ids.customError : undefined}
                    className="h-8 font-mono uppercase"
                  />
                </div>
                {customInvalid ? <FieldError id={ids.customError}>{t('custom.invalid')}</FieldError> : null}
              </Field>
            ) : null}
          </>
        ) : (
          <UpgradeNudge feature="custom_branding" hint="customColorLocked" compact />
        )}
      </div>
    ) : null

  const controls: ReactNode = (
    <>
      {themeGroup}
      {colorGroup}
      {customSection}
    </>
  )

  const phone = (
    <PreviewLessonPhone
      theme={previewTheme}
      brand={previewBrand}
      mode={mode}
      className={variant === 'onboarding' ? 'hidden md:flex' : undefined}
    />
  )

  if (variant === 'onboarding') {
    return (
      <div
        data-testid="theme-kit-picker"
        data-variant="onboarding"
        className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]"
      >
        <div className="flex flex-col gap-6">
          {platformDefaultStatus}
          {controls}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <button
              type="button"
              data-testid="theme-kit-back"
              onClick={onBack}
              disabled={isPending}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 px-4 text-sm')}
            >
              {t('back')}
            </button>
            <button
              type="button"
              data-testid="theme-kit-save"
              onClick={handleNext}
              disabled={isPending}
              className={cn(buttonVariants({ size: 'lg' }), 'h-10 px-5 text-sm font-semibold')}
            >
              {saving ? spinner : null}
              {saving ? t('saving') : t('next')}
            </button>
          </div>
        </div>
        {phone}
      </div>
    )
  }

  return (
    <div
      data-testid="theme-kit-picker"
      data-variant="admin"
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]"
    >
      <Card className="gap-5 py-5">
        <CardHeader className="gap-1.5 px-5">
          <CardTitle className="text-lg font-semibold tracking-tight">
            <h2>{t('title')}</h2>
          </CardTitle>
          <CardDescription className="text-sm/relaxed">{t('description')}</CardDescription>
          {platformDefaultStatus}
        </CardHeader>
        <CardContent className="flex flex-col gap-6 px-5">{controls}</CardContent>
        <CardFooter className="flex-col items-stretch gap-2 border-t px-5">
          <button
            ref={saveRef}
            type="button"
            data-testid="theme-kit-save"
            onClick={saveLook}
            aria-disabled={saveBlocked}
            className={cn(buttonVariants({ size: 'lg' }), 'h-10 w-full text-sm font-semibold', ARIA_DISABLED_CLASS)}
          >
            {saving ? spinner : null}
            {saving ? t('saving') : t('save')}
          </button>
          {stored ? (
            <button
              type="button"
              data-testid="theme-kit-reset"
              onClick={reset}
              aria-disabled={isPending}
              className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'h-9 w-full text-sm', ARIA_DISABLED_CLASS)}
            >
              {resetting ? spinner : null}
              {resetting ? t('resetting') : t('reset')}
            </button>
          ) : null}
        </CardFooter>
      </Card>
      {phone}
      <PreviewSchoolPage
        theme={previewTheme}
        brand={previewBrand}
        mode={mode}
        className="hidden md:flex xl:col-span-2"
      />
    </div>
  )
}
