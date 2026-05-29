import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'
import { accentColorField, accentVars } from '../../utils/accent-color'

export type BannerProps = {
  text: string
  style: 'brand' | 'info' | 'warning' | 'success' | 'urgent'
  accentColor: string
} & SectionSpacingProps

const bannerClasses: Record<string, string> = {
  brand: 'bg-[var(--block-accent)] text-primary-foreground border-transparent',
  info: 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  warning: 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  success: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  urgent: 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
}

export const Banner: ComponentConfig<BannerProps> = {
  label: 'Banner',
  fields: {
    text: { type: 'text', label: 'Text' },
    style: {
      type: 'select',
      label: 'Style',
      options: [
        { label: 'Brand', value: 'brand' },
        { label: 'Info', value: 'info' },
        { label: 'Warning', value: 'warning' },
        { label: 'Success', value: 'success' },
        { label: 'Urgent', value: 'urgent' },
      ],
    },
    accentColor: { ...accentColorField, label: 'Accent Color (Brand style)' },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    paddingY: 'sm' as const,
    text: 'Welcome! Enrollment is now open for our new courses.',
    style: 'info',
    accentColor: '',
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, text, style: bannerStyle, accentColor }) => {
    if (!text) return <></>

    const spacing = { paddingY, paddingX, maxWidth, marginY }
    const role = bannerStyle === 'warning' || bannerStyle === 'urgent' ? 'alert' : 'status'

    return (
      <div className={sectionOuterClass(spacing)} style={accentVars(accentColor)}>
        <div className={sectionInnerClass(spacing)}>
          <div
            role={role}
            className={cn(
              'px-6 py-4 border rounded-xl font-medium text-[0.9375rem] text-center',
              bannerClasses[bannerStyle]
            )}
          >
            {text}
          </div>
        </div>
      </div>
    )
  },
}
