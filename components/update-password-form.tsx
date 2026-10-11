'use client'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAnalytics } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { localizePath } from '@/lib/auth/route-access'
import { passwordResetErrorKey } from '@/lib/auth/password-reset-errors'

interface UpdatePasswordFormProps extends React.ComponentPropsWithoutRef<'div'> {
  hasSession: boolean
}

export function UpdatePasswordForm({ hasSession, className, ...props }: UpdatePasswordFormProps) {
  const t = useTranslations('auth.updatePassword')
  const locale = useLocale()
  const analytics = useAnalytics()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const invalidLink = !hasSession || sessionExpired
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault()
    if (isLoading || invalidLink) return
    setError(null)
    if (password !== confirmation) { setError(t('errors.mismatch')); return }
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      analytics.track(ANALYTICS_EVENTS.PASSWORD_RESET_COMPLETED, {})
      toast.success(t('success'))
      router.replace(localizePath('/dashboard/student', locale))
      router.refresh()
    } catch (error: unknown) {
      const key = passwordResetErrorKey(error)
      if (key === 'invalidLink') setSessionExpired(true)
      else setError(t(`errors.${key === 'delivery' ? 'generic' : key}`))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t(invalidLink ? 'invalidLink.title' : 'title')}</CardTitle>
          <CardDescription>{t(invalidLink ? 'invalidLink.description' : 'description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {invalidLink ? (
            <Link href={localizePath('/auth/forgot-password', locale)} className={cn(buttonVariants(), 'w-full')}>
              {t('invalidLink.requestNew')}
            </Link>
          ) : (
            <form onSubmit={handleUpdatePassword} aria-busy={isLoading}>
              <FieldGroup>
                <Field data-disabled={isLoading}>
                  <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
                  <Input id="password" name="password" data-testid="update-password-password"
                    type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                    minLength={6} required disabled={isLoading} value={password}
                    aria-describedby="password-hint" onChange={(event) => setPassword(event.target.value)} />
                  <FieldDescription id="password-hint">{t('hint')}</FieldDescription>
                </Field>
                <Field data-disabled={isLoading} data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="confirmation">{t('confirmPassword')}</FieldLabel>
                  <Input id="confirmation" name="confirmation" data-testid="update-password-confirmation"
                    type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                    minLength={6} required disabled={isLoading} value={confirmation}
                    aria-invalid={Boolean(error)} aria-describedby={error ? 'password-error' : undefined}
                    onChange={(event) => setConfirmation(event.target.value)} />
                </Field>
                <Button type="button" variant="ghost" aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}>
                  {t(showPassword ? 'hidePassword' : 'showPassword')}
                </Button>
                {error ? <FieldError id="password-error">{error}</FieldError> : null}
                <Button type="submit" data-testid="update-password-submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t('submitting') : t('submit')}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
