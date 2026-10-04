import { useId } from 'react'
import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

export type ContactFormProps = {
  title: string
  subtitle: string
  email: string
  showPhone: boolean
  showMessage: boolean
} & SectionSpacingProps

const inputClasses = 'w-full rounded-input border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-[0.9375rem] transition-colors motion-reduce:transition-none duration-200'

export const ContactForm: ComponentConfig<ContactFormProps> = {
  label: 'Contact Form',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    email: { type: 'text', label: 'Contact Email' },
    showPhone: {
      type: 'radio',
      label: 'Show Phone Field',
      options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
    },
    showMessage: {
      type: 'radio',
      label: 'Show Message Field',
      options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'Contact Us',
    subtitle: 'Have a question? We would love to hear from you.',
    email: 'hello@school.com',
    showPhone: false,
    showMessage: true,
  },
  render: function ContactFormView({ paddingY, paddingX, maxWidth, marginY, title, subtitle, showPhone, showMessage }) {
    const id = useId()
    const t = useTranslations('puck.render')
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="max-w-[640px] mx-auto">
            {title && (
              <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-center text-muted-foreground mb-8">{subtitle}</p>
            )}
            <form className="flex flex-col gap-4" onSubmit={e => e.preventDefault()}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${id}-name`} className="sr-only">{t('name')}</label>
                  <input id={`${id}-name`} name="name" autoComplete="name" className={inputClasses} placeholder={t('name')} type="text" />
                </div>
                <div>
                  <label htmlFor={`${id}-email`} className="sr-only">{t('email')}</label>
                  <input id={`${id}-email`} name="email" autoComplete="email" spellCheck={false} className={inputClasses} placeholder={t('email')} type="email" />
                </div>
              </div>
              {showPhone && (
                <div>
                  <label htmlFor={`${id}-phone`} className="sr-only">{t('phone')}</label>
                  <input id={`${id}-phone`} name="phone" autoComplete="tel" className={inputClasses} placeholder={t('phone')} type="tel" />
                </div>
              )}
              {showMessage && (
                <div>
                  <label htmlFor={`${id}-message`} className="sr-only">{t('message')}</label>
                  <textarea
                    id={`${id}-message`} name="message"
                    className={`${inputClasses} min-h-[120px] resize-y`}
                    placeholder={t('message')}
                  />
                </div>
              )}
              <Button
                type="submit"
                size="lg"
                className="h-11 text-base font-semibold"
              >
                {t('sendMessage')}
              </Button>
            </form>
          </div>
        </div>
      </div>
    )
  },
}
