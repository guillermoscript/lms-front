'use client'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'

interface LoginFormProps extends React.ComponentPropsWithoutRef<'div'> {
  tenantId?: string
}

export function LoginForm({ className, tenantId, ...props }: LoginFormProps) {
  const t = useTranslations('auth.login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSocialLoading, setIsSocialLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error

      // Update preferred tenant if provided
      if (tenantId) {
        await supabase.auth.updateUser({
          data: { preferred_tenant_id: tenantId }
        })
        // Refresh session to get updated JWT claims
        await supabase.auth.refreshSession()
      }

      // Get user role to redirect to the correct dashboard
      const { data: { session } } = await supabase.auth.getSession()
      let userRole = 'student'

      if (session?.access_token) {
        try {
          const payload = JSON.parse(atob(session.access_token.split('.')[1]))
          userRole = payload.user_role || 'student'
        } catch (e) {
          console.error('Error parsing token for role:', e)
        }
      }

      router.push(`/dashboard/${userRole}`)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    setIsSocialLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        },
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t('common.error'))
      setIsSocialLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="login-title">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  data-testid="login-email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">{t('password')}</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    {t('forgotPassword')}
                  </Link>
                </div>
                <InputGroup>
                  <InputGroupInput
                    id="password"
                    data-testid="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading || isSocialLoading} data-testid="login-submit">
                {isLoading ? t('submitting') : t('submit')}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t('orContinueWith')}</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || isSocialLoading}
                onClick={handleGoogleLogin}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {isSocialLoading ? t('submitting') : t('continueWithGoogle')}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              {t('noAccount')}{' '}
              <Link href="/auth/sign-up" className="underline underline-offset-4">
                {t('signup')}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
