'use client'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAnalytics } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { localizePath } from '@/lib/auth/route-access'
import { passwordResetErrorKey } from '@/lib/auth/password-reset-errors'

export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const t = useTranslations('auth.forgotPassword')
  const locale = useLocale()
  const analytics = useAnalytics()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [retrySeconds, setRetrySeconds] = useState(0)

  useEffect(() => {
    if (retrySeconds <= 0) return
    const timer = setTimeout(() => setRetrySeconds((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [retrySeconds])

  async function requestReset() {
    if (isLoading || retrySeconds > 0) return
    setIsLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}${localizePath('/auth/update-password', locale)}`,
      })
      if (error) throw error
      setSuccess(true)
      setRetrySeconds(60)
      analytics.track(ANALYTICS_EVENTS.PASSWORD_RESET_REQUESTED, {})
    } catch (error: unknown) {
      const key = passwordResetErrorKey(error)
      setError(t(`errors.${key === 'rateLimited' || key === 'delivery' ? key : 'generic'}`))
      if (key === 'rateLimited') setRetrySeconds(60)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t(success ? 'success.title' : 'title')}</CardTitle>
          <CardDescription>{t(success ? 'success.description' : 'description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col gap-4" aria-live="polite">
              <p className="text-sm text-muted-foreground">{t('success.info', { email: email.trim() })}</p>
              <p className="text-sm text-muted-foreground">{t('success.spam')}</p>
              {error ? <FieldError>{error}</FieldError> : null}
              <Button type="button" variant="outline" data-testid="forgot-password-resend"
                disabled={isLoading || retrySeconds > 0} onClick={() => void requestReset()}>
                {isLoading ? t('submitting') : retrySeconds > 0 ? t('resendIn', { seconds: retrySeconds }) : t('resend')}
              </Button>
              <Button type="button" variant="ghost" disabled={isLoading} onClick={() => { setSuccess(false); setError(null); setRetrySeconds(0) }}>
                {t('changeEmail')}
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void requestReset() }} aria-busy={isLoading}>
              <FieldGroup>
                <Field data-disabled={isLoading}>
                  <FieldLabel htmlFor="email">{t('email')}</FieldLabel>
                  <Input id="email" name="email" data-testid="forgot-password-email" type="email"
                    autoComplete="email" placeholder="nombre@ejemplo.com" required
                    disabled={isLoading} value={email} onChange={(event) => setEmail(event.target.value)} />
                </Field>
                {error ? <FieldError>{error}</FieldError> : null}
                <Button type="submit" data-testid="forgot-password-submit" className="w-full" disabled={isLoading || retrySeconds > 0}>
                  {isLoading ? t('submitting') : retrySeconds > 0 ? t('resendIn', { seconds: retrySeconds }) : t('submit')}
                </Button>
              </FieldGroup>
            </form>
          )}
          <div className="mt-4 text-center text-sm">
            <Link href={localizePath('/auth/login', locale)} className="underline underline-offset-4">
              {t('backToLogin')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
