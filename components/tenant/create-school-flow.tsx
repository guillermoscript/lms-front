'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Mail,
} from 'lucide-react'

interface CreateSchoolFlowProps {
  user: { id: string; email: string } | null
  plan?: string
  interval?: 'monthly' | 'yearly'
}

export function CreateSchoolFlow({ user, plan, interval }: CreateSchoolFlowProps) {
  // Query string carrying the pricing-page plan choice through the flow ('' when no plan / free)
  const planQuery = plan && plan !== 'free'
    ? `?plan=${encodeURIComponent(plan)}${interval ? `&interval=${interval}` : ''}`
    : ''
  const router = useRouter()
  const t = useTranslations('createSchool')
  const [step, setStep] = useState<'account' | 'school'>(user ? 'school' : 'account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailConfirmationNeeded, setEmailConfirmationNeeded] = useState(false)
  // Google sign-in leaves the page, so this only ever unsets via the stall timer
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialStalled, setSocialStalled] = useState(false)
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [signedInEmail, setSignedInEmail] = useState(user?.email || '')

  // Account state
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // School state
  const [schoolName, setSchoolName] = useState('')
  const [slug, setSlug] = useState('')

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleNameChange = (value: string) => {
    setSchoolName(value)
    if (!slug || slug === generateSlug(schoolName)) {
      setSlug(generateSlug(value))
    }
  }

  const clearStallTimer = () => {
    if (stallTimer.current) {
      clearTimeout(stallTimer.current)
      stallTimer.current = null
    }
  }

  // The OAuth redirect unloads the page; clear the timer so a bfcache restore
  // (user backs out of Google) doesn't fire a stale "not responding" hint.
  useEffect(() => {
    const onPageHide = () => clearStallTimer()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      clearStallTimer()
    }
  }, [])

  const handleGoogleSignUp = async () => {
    const supabase = createClient()
    setError(null)
    setSocialStalled(false)
    setSocialLoading(true)
    clearStallTimer()

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(`/create-school${planQuery}`)}`,
      },
    })

    if (error) {
      setSocialLoading(false)
      setError(error.message)
      return
    }

    // signInWithOAuth resolves the moment it calls window.location.assign, not
    // when the navigation lands. Where accounts.google.com is unreachable the
    // request just hangs on this page — hand the email form back instead of
    // leaving a dead button (Sentry LMS-FRONT-9P: rage clicks from CN).
    stallTimer.current = setTimeout(() => {
      stallTimer.current = null
      setSocialLoading(false)
      setSocialStalled(true)
    }, 8000)
  }

  // Step 1: Sign up + sign in, then advance to school step
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const name = ownerName.trim()
    if (!name) {
      setError(t('errorNameRequired'))
      return
    }

    if (password.length < 6) {
      setError(t('errorPasswordTooShort'))
      return
    }

    setLoading(true)
    const supabase = createClient()

    // Sign up. Email verification is async: if Supabase returns a session
    // (auto-confirm or confirmation-optional config) we continue immediately
    // and the dashboard shows a "verify your email" banner until confirmed.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/create-school`,
        // handle_new_user() copies full_name into profiles; without it the owner
        // shows up as "Unknown" in every people list.
        data: { full_name: name },
      },
    })

    if (signUpError) {
      if (signUpError.message.includes('already registered') || signUpError.message.includes('already exists')) {
        setError(t('errorEmailRegistered'))
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    if (!signUpData.session) {
      // Sign-up may not return a session when the email already exists
      // (Supabase obfuscation) — a direct sign-in still works there.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        // Supabase strictly requires email confirmation before any session
        // exists — the check-your-email fallback is unavoidable here.
        setEmailConfirmationNeeded(true)
        setLoading(false)
        return
      }
    }

    // Success — advance to school step
    setSignedInEmail(email.trim())
    setLoading(false)
    setStep('school')
  }

  // Step 2: Create the school using client-side RPC (has fresh session cookies)
  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schoolName.trim() || !slug.trim()) return
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Use the create_school RPC which runs as the authenticated user
      const { data: tenantId, error: createError } = await supabase
        .rpc('create_school', { _name: schoolName.trim(), _slug: slug.trim() })

      if (createError) {
        if (createError.code === '23505') {
          setError(t('errorSlugTaken'))
        } else {
          setError(t('errorCreateFailed', { message: createError.message }))
        }
        setLoading(false)
        return
      }

      // Update preferred tenant so the user lands on this school by default
      await supabase.auth.updateUser({ data: { preferred_tenant_id: tenantId } })

      // Refresh session so the JWT picks up the new app_metadata.tenant_id
      // (set by the create_school RPC) and tenant_role from the hook.
      await supabase.auth.refreshSession()

      // Setup is checklist-driven from the dashboard now; the wizard at
      // /onboarding stays available as an optional guided path.
      const { data: { user: authedUser } } = await supabase.auth.getUser()
      if (authedUser) {
        await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', authedUser.id)
      }

      toast.success(t('created'))

      // Land directly on the dashboard (subdomain if configured), carrying a
      // paid plan choice from /platform-pricing into the upgrade page.
      const destination = planQuery
        ? `/dashboard/admin/billing/upgrade${planQuery}`
        : '/dashboard/admin'
      const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
      if (platformDomain && platformDomain !== 'localhost') {
        const protocol = window.location.protocol
        window.location.href = `${protocol}//${slug.trim()}.${platformDomain}${destination}`
      } else {
        router.push(destination)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorGeneric'))
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
          <GraduationCap className="w-7 h-7 text-blue-400" />
        </div>
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-zinc-400 mt-2">
          {step === 'account' ? t('subtitleAccount') : t('subtitleSchool')}
        </p>
      </div>

      {/* Step indicator (only for new users) */}
      {!user && (
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
              step === 'school' ? 'bg-emerald-500' : 'bg-blue-500'
            }`} />
            <span className={`text-xs ${step === 'school' ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {step === 'school' ? t('stepSignedUp') : t('stepAccount')}
            </span>
          </div>
          <div className={`w-8 h-px transition-colors ${step === 'school' ? 'bg-blue-500' : 'bg-zinc-700'}`} />
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step === 'school' ? 'bg-blue-500' : 'bg-zinc-700'}`} />
            <span className="text-xs text-zinc-500">{t('stepSchool')}</span>
          </div>
        </div>
      )}

      {/* Step 1: Account — sign up + sign in */}
      {step === 'account' && !emailConfirmationNeeded && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <form onSubmit={handleSignUp} className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:text-white hover:bg-zinc-800"
                onClick={handleGoogleSignUp}
                disabled={loading || socialLoading}
                data-testid="create-school-google"
              >
                {socialLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {socialLoading ? t('googleRedirecting') : t('google')}
              </Button>

              {socialStalled && (
                <p className="text-sm text-amber-400" role="status" data-testid="create-school-google-stalled">
                  {t('googleUnreachable')}
                </p>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-900 px-2 text-zinc-500">{t('orEmail')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-name" className="text-zinc-300">{t('nameLabel')}</Label>
                <Input
                  id="owner-name"
                  type="text"
                  autoComplete="name"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">{t('emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">{t('passwordLabel')}</Label>
                <InputGroup>
                  <InputGroupInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('passwordPlaceholder')}
                    className="bg-zinc-800 border-zinc-700 text-white"
                    required
                    disabled={loading}
                    minLength={6}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('creatingAccount')}
                  </>
                ) : (
                  <>
                    {t('createAccount')}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-zinc-500">
                {t('haveAccount')}{' '}
                <Link href={`/auth/login?redirectTo=${encodeURIComponent(`/create-school${planQuery}`)}`} className="text-blue-400 hover:text-blue-300 underline underline-offset-4">
                  {t('logIn')}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Email confirmation needed */}
      {step === 'account' && emailConfirmationNeeded && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                <Mail className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-white">{t('confirmTitle')}</h2>
                <p className="text-sm text-zinc-400">
                  {t('confirmBody', { email })}
                  <br />
                  {t('confirmHint')}
                </p>
              </div>
              <div className="w-full pt-2 space-y-3">
                <Link href={`/auth/login?redirectTo=${encodeURIComponent(`/create-school${planQuery}`)}`}>
                  <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                    {t('goToLogin')}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setEmailConfirmationNeeded(false); setError(null) }}
                  className="w-full text-zinc-500 hover:text-zinc-300"
                >
                  <ArrowLeft className="mr-2 w-4 h-4" />
                  {t('backToSignUp')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: School — name and URL */}
      {step === 'school' && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <form onSubmit={handleCreateSchool} className="space-y-4">
              {signedInEmail && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <p className="text-sm text-emerald-300 truncate">
                    {t('signedInAs', { email: signedInEmail })}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="school-name" className="text-zinc-300">{t('schoolNameLabel')}</Label>
                <Input
                  id="school-name"
                  data-testid="create-school-name"
                  value={schoolName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t('schoolNamePlaceholder')}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="school-slug" className="text-zinc-300">{t('schoolUrlLabel')}</Label>
                <div className="flex items-center gap-0">
                  <Input
                    id="school-slug"
                    data-testid="create-school-slug"
                    value={slug}
                    onChange={(e) => setSlug(generateSlug(e.target.value))}
                    placeholder={t('schoolUrlPlaceholder')}
                    className="bg-zinc-800 border-zinc-700 text-white rounded-r-none"
                    required
                    disabled={loading}
                  />
                  <span className="px-3 py-2 bg-zinc-700 border border-l-0 border-zinc-700 rounded-r-md text-zinc-400 text-sm whitespace-nowrap">
                    .{process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">{t('slugHint')}</p>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                data-testid="create-school-submit"
                disabled={loading || !schoolName.trim() || !slug.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('creatingSchool')}
                  </>
                ) : (
                  <>
                    {t('createSchool')}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </>
                )}
              </Button>

              {!user && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setStep('account'); setError(null) }}
                  className="w-full text-zinc-500 hover:text-zinc-300"
                  disabled={loading}
                >
                  <ArrowLeft className="mr-2 w-4 h-4" />
                  {t('back')}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
