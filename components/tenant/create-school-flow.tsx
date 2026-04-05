'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
}

export function CreateSchoolFlow({ user }: CreateSchoolFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<'account' | 'school'>(user ? 'school' : 'account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailConfirmationNeeded, setEmailConfirmationNeeded] = useState(false)
  const [signedInEmail, setSignedInEmail] = useState(user?.email || '')

  // Account state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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

  const handleGoogleSignUp = async () => {
    const supabase = createClient()
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/create-school`,
      },
    })
    if (error) {
      setError(error.message)
    }
  }

  // Step 1: Sign up + sign in, then advance to school step
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // Sign up
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (signUpError) {
      if (signUpError.message.includes('already registered') || signUpError.message.includes('already exists')) {
        setError('This email is already registered. Please log in instead.')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    // Sign in immediately
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setEmailConfirmationNeeded(true)
      setLoading(false)
      return
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
          setError('This school URL is already taken. Please choose a different one.')
        } else {
          setError('Failed to create school: ' + createError.message)
        }
        setLoading(false)
        return
      }

      // Update preferred tenant so the user lands on this school by default
      await supabase.auth.updateUser({ data: { preferred_tenant_id: tenantId } })

      // Refresh session so the JWT picks up the new app_metadata.tenant_id
      // (set by the create_school RPC) and tenant_role from the hook.
      await supabase.auth.refreshSession()

      toast.success('School created! Setting up your dashboard...')

      // Redirect to subdomain onboarding
      const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
      if (platformDomain && platformDomain !== 'localhost') {
        const protocol = window.location.protocol
        window.location.href = `${protocol}//${slug.trim()}.${platformDomain}/onboarding`
      } else {
        router.push('/onboarding')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
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
        <h1 className="text-3xl font-bold text-white">Create Your School</h1>
        <p className="text-zinc-400 mt-2">
          {step === 'account'
            ? 'First, create your account'
            : 'Choose a name and URL for your school'}
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
              {step === 'school' ? 'Signed up' : 'Account'}
            </span>
          </div>
          <div className={`w-8 h-px transition-colors ${step === 'school' ? 'bg-blue-500' : 'bg-zinc-700'}`} />
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step === 'school' ? 'bg-blue-500' : 'bg-zinc-700'}`} />
            <span className="text-xs text-zinc-500">School</span>
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
                disabled={loading}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-900 px-2 text-zinc-500">Or continue with email</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Password</Label>
                <InputGroup>
                  <InputGroupInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="bg-zinc-800 border-zinc-700 text-white"
                    required
                    disabled={loading}
                    minLength={6}
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

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-zinc-300">Confirm Password</Label>
                <InputGroup>
                  <InputGroupInput
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="bg-zinc-800 border-zinc-700 text-white"
                    required
                    disabled={loading}
                    minLength={6}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff /> : <Eye />}
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
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account & Continue
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-zinc-500">
                Already have an account?{' '}
                <Link href="/auth/login?redirectTo=/create-school" className="text-blue-400 hover:text-blue-300 underline underline-offset-4">
                  Log in
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
                <h2 className="text-xl font-semibold text-white">Check your email</h2>
                <p className="text-sm text-zinc-400">
                  We sent a confirmation link to{' '}
                  <span className="text-zinc-200 font-medium">{email}</span>.
                  <br />
                  Please verify your email, then log in to continue.
                </p>
              </div>
              <div className="w-full pt-2 space-y-3">
                <Link href="/auth/login?redirectTo=/create-school">
                  <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                    Go to Log in
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
                  Back to sign up
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
                  <p className="text-sm text-emerald-300 truncate">Signed in as {signedInEmail}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="school-name" className="text-zinc-300">School Name</Label>
                <Input
                  id="school-name"
                  data-testid="create-school-name"
                  value={schoolName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My Awesome Academy"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="school-slug" className="text-zinc-300">School URL</Label>
                <div className="flex items-center gap-0">
                  <Input
                    id="school-slug"
                    data-testid="create-school-slug"
                    value={slug}
                    onChange={(e) => setSlug(generateSlug(e.target.value))}
                    placeholder="my-academy"
                    className="bg-zinc-800 border-zinc-700 text-white rounded-r-none"
                    required
                    disabled={loading}
                  />
                  <span className="px-3 py-2 bg-zinc-700 border border-l-0 border-zinc-700 rounded-r-md text-zinc-400 text-sm whitespace-nowrap">
                    .{process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  Only lowercase letters, numbers, and hyphens
                </p>
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
                    Creating your school...
                  </>
                ) : (
                  <>
                    Create School
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
                  Back
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
