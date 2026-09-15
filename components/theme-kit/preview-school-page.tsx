'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { ThemeKitPreview, usePreviewSchool, type KitPreviewProps } from './theme-kit-preview'

const OUTLINE = [1, 2, 3] as const
const COURSES = [1, 2, 3] as const
const FEATURED_PROGRESS = [true, true, false, false]

/**
 * A school's public page in the picked theme (the "Storefront" artboard). It
 * lays itself out with container queries, so it reads as a desktop page when
 * the column is wide and folds like the real page when it is not — no fixed
 * 1280px canvas and no scaling transform. Sample content only, hidden from
 * assistive tech.
 */
export function PreviewSchoolPage({ theme, brand, mode, className }: KitPreviewProps) {
  const t = useTranslations('themeKit.preview')
  const school = usePreviewSchool()

  return (
    <figure className={cn('m-0 flex min-w-0 flex-col gap-2', className)}>
      <figcaption className="text-xs text-muted-foreground">{t('schoolCaption')}</figcaption>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <ThemeKitPreview
          theme={theme}
          brand={brand}
          mode={mode}
          data-testid="theme-kit-preview-school"
          aria-hidden="true"
          className="@container"
        >
          <div className="flex items-center gap-3 border-b border-border px-5 py-3 @3xl:px-12 @3xl:py-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-input bg-primary font-heading text-base font-bold text-primary-foreground @3xl:size-9">
              {school.initial}
            </span>
            <span className="min-w-0 truncate font-heading text-base font-semibold tracking-tight @3xl:text-xl">
              {school.name}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-6 text-sm text-muted-foreground">
              <span className="hidden @2xl:inline">{t('school.navCourses')}</span>
              <span className="hidden @2xl:inline">{t('school.navAbout')}</span>
              <span className="hidden @2xl:inline">{t('school.navSignIn')}</span>
              <span className="flex h-9 items-center rounded-button bg-primary px-4 font-semibold text-primary-foreground @3xl:h-11 @3xl:px-5">
                {t('school.navCta')}
              </span>
            </div>
          </div>

          <div className="grid gap-8 px-5 py-8 @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] @3xl:items-center @3xl:gap-12 @3xl:px-12 @3xl:py-12">
            <div className="flex flex-col gap-4 @3xl:gap-5">
              <span className="text-sm font-semibold text-[var(--brand-text)]">{t('school.kicker')}</span>
              <h1 className="text-3xl/tight font-semibold tracking-tight text-balance @3xl:text-5xl/[1.06]">
                {t('school.tagline')}
              </h1>
              <p className="max-w-[54ch] text-base/relaxed text-muted-foreground @3xl:text-lg/relaxed">
                {t('school.subtitle')}
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <span className="flex h-11 items-center rounded-button bg-primary px-6 text-base font-semibold text-primary-foreground @3xl:h-13">
                  {t('school.start')}
                </span>
                <span className="text-[0.9375rem] font-semibold text-[var(--brand-text)] underline underline-offset-4">
                  {t('school.syllabus')}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-card border border-border bg-card text-card-foreground">
              <div className="flex flex-col gap-2 bg-primary px-6 pt-6 pb-5 text-primary-foreground">
                <span className="text-[0.8125rem]">{t('school.featuredMeta')}</span>
                <span className="font-heading text-2xl/tight font-semibold tracking-tight">{t('school.featuredTitle')}</span>
              </div>
              <div className="flex flex-col px-6 py-1.5">
                {OUTLINE.map((n) => (
                  <div key={n} className="flex items-center gap-3.5 border-b border-border py-3 text-[0.9375rem]">
                    <span className="font-mono text-[0.8125rem] text-muted-foreground">0{n}</span>
                    <span className="min-w-0 flex-1">{t(`school.outline${n}Title`)}</span>
                    <span className="shrink-0 text-[0.8125rem] text-muted-foreground">{t(`school.outline${n}Kind`)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2.5 px-6 pt-3 pb-5">
                <div className="flex flex-1 gap-1">
                  {FEATURED_PROGRESS.map((done, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1.5 flex-1 rounded-[calc(var(--radius-button)/2)]',
                        done ? 'bg-[var(--brand-text)]' : 'bg-border'
                      )}
                    />
                  ))}
                </div>
                <span className="shrink-0 text-[0.8125rem] text-muted-foreground">{t('school.syllabusPreview')}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-5 pb-8 @3xl:gap-5 @3xl:px-12 @3xl:pb-12">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight @3xl:text-2xl">{t('school.coursesHeading')}</h2>
              <span className="text-sm font-semibold text-[var(--brand-text)]">{t('school.seeAll')}</span>
            </div>
            <div className="grid gap-4 @lg:grid-cols-3 @3xl:gap-5">
              {COURSES.map((n) => (
                <div
                  key={n}
                  className="flex flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground"
                >
                  <div className="flex h-16 items-end bg-[var(--brand-tint)] px-4 pb-2.5">
                    <span className="font-mono text-[0.8125rem] text-[var(--brand-text)]">0{n}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 px-4 pt-4 pb-4.5">
                    <h3 className="text-lg/snug font-semibold">{t(`school.course${n}Title`)}</h3>
                    <span className="text-sm text-muted-foreground">{t(`school.course${n}Meta`)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-border px-5 py-4 text-sm text-muted-foreground @3xl:px-12">
            <span>{t('school.footerPayments')}</span>
            <span>{t('school.footerCertificate')}</span>
          </div>
        </ThemeKitPreview>
      </div>
    </figure>
  )
}
