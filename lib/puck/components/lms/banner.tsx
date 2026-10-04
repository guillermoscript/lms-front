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
  brand: 'bg-[var(--block-accent)] text-[var(--block-accent-foreground)] border-transparent',
  info: 'bg-brand-tint text-brand-text border-primary/25',
  warning: 'bg-warning/10 text-warning border-warning/30',
  success: 'bg-success/10 text-success border-success/30',
  urgent: 'bg-destructive/10 text-destructive border-destructive/30',
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
              'px-6 py-4 border rounded-card font-medium text-[0.9375rem] text-center',
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
