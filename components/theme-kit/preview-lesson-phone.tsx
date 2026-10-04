'use client'

import { useTranslations } from 'next-intl'
import { IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ThemeKitPreview, usePreviewSchool, type KitPreviewProps } from './theme-kit-preview'

const PROGRESS = [true, true, true, false, false]
const OPTIONS = ['optionA', 'optionB', 'optionC'] as const
const SELECTED_OPTION: (typeof OPTIONS)[number] = 'optionB'

/**
 * A lesson on a phone in the picked theme (the "Lesson" artboard of the design
 * canvas). Sample content only: the subtree is hidden from assistive tech and
 * holds nothing focusable; the caption names what it shows. State marks
 * (progress, the chosen answer) use `--brand-text`, the brand shade that clears
 * AA on these surfaces, so a dark brand stays visible on a dark theme.
 */
export function PreviewLessonPhone({ theme, brand, mode, className }: KitPreviewProps) {
  const t = useTranslations('themeKit.preview')
  const school = usePreviewSchool()

  return (
    <figure className={cn('m-0 flex min-w-0 flex-col gap-2', className)}>
      <figcaption className="text-xs text-muted-foreground">{t('lessonCaption')}</figcaption>
      <div className="w-full max-w-[390px] rounded-[2rem] bg-muted p-2 ring-1 ring-foreground/10">
        <ThemeKitPreview
          theme={theme}
          brand={brand}
          mode={mode}
          data-testid="theme-kit-preview-lesson"
          aria-hidden="true"
          className="flex flex-col overflow-hidden rounded-[1.5rem]"
        >
          <div className="flex h-15 items-center gap-2.5 border-b border-border pr-2 pl-5">
            <span className="flex size-7.5 shrink-0 items-center justify-center rounded-input bg-primary font-heading text-sm font-bold text-primary-foreground">
              {school.initial}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{school.name}</span>
            <span className="flex size-11 items-center justify-center text-muted-foreground">
              <IconX className="size-5" />
            </span>
          </div>

          <div className="flex flex-col gap-3.5 px-5 pt-4 pb-5">
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between gap-3 text-[0.8125rem] text-muted-foreground">
                <span className="min-w-0">{t('lesson.module')}</span>
                <span className="shrink-0 font-mono tabular-nums">{t('lesson.progress', { done: 3, total: 5 })}</span>
              </div>
              <div className="flex gap-1">
                {PROGRESS.map((done, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-[calc(var(--radius-button)/2)]',
                      done ? 'bg-[var(--brand-text)]' : 'bg-border'
                    )}
                  />
                ))}
              </div>
            </div>

            <h1 className="text-3xl/tight font-semibold tracking-tight text-balance">{t('lesson.title')}</h1>
            <p className="text-base/relaxed">{t('lesson.body')}</p>

            <div className="flex flex-col gap-1 rounded-card bg-[var(--brand-tint)] px-4 py-3.5">
              <span className="text-[0.8125rem] font-semibold text-[var(--brand-text)]">{t('lesson.keyIdeaLabel')}</span>
              <span className="text-[0.9375rem]/normal">{t('lesson.keyIdea')}</span>
            </div>

            <div className="flex flex-col gap-3.5 rounded-card border border-border bg-card px-4 py-4.5 text-card-foreground">
              <span className="font-mono text-[0.8125rem] text-muted-foreground">
                {t('lesson.checkpoint', { current: 4, total: 5 })}
              </span>
              <span className="text-[1.0625rem]/snug font-semibold">{t('lesson.question')}</span>
              <div className="flex flex-col gap-2">
                {OPTIONS.map((option) => {
                  const selected = option === SELECTED_OPTION
                  return (
                    <div
                      key={option}
                      className={cn(
                        'flex min-h-13 items-center gap-3 rounded-input text-[0.9375rem]',
                        selected
                          ? 'border-2 border-[var(--brand-text)] bg-[var(--brand-tint)] px-[13px] font-semibold'
                          : 'border border-border px-3.5'
                      )}
                    >
                      <span
                        className={cn(
                          'size-5 shrink-0 rounded-full',
                          selected ? 'border-[6px] border-[var(--brand-text)]' : 'border-[1.5px] border-muted-foreground'
                        )}
                      />
                      <span>{t(`lesson.${option}`)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-border px-5 pt-3.5 pb-5">
            <div className="flex min-h-13 items-center justify-center rounded-button bg-primary px-4 text-center text-base font-semibold text-primary-foreground">
              {t('lesson.check')}
            </div>
          </div>
        </ThemeKitPreview>
      </div>
    </figure>
  )
}
