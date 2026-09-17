'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { completeOnboarding } from '@/app/actions/onboarding'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { ThemeKitPicker } from '@/components/theme-kit/theme-kit-picker'
import { KIT_THEMES, resolveSchoolTheme, type StoredKitTheme } from '@/lib/themes/kit'
import { cn } from '@/lib/utils'
import {
  GraduationCap,
  Palette,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Sparkles,
  CreditCard,
  DollarSign,
  AlertCircle,
} from 'lucide-react'

interface OnboardingWizardProps {
  userId: string
  userName: string
  currentSettings: Record<string, { value?: string } | undefined>
  /** The school's saved theme, unresolved (`getSchoolTheme()`); null = platform palette. */
  storedTheme: StoredKitTheme | null
  /** Whether the plan includes `custom_branding`. */
  customBranding: boolean
  redirectTo?: string
}

const ALL_STEPS = ['welcome', 'school', 'branding', 'payment', 'ready'] as const
type Step = typeof ALL_STEPS[number]

export default function OnboardingWizard({
  userName,
  currentSettings,
  storedTheme,
  customBranding,
  redirectTo = '/dashboard/admin',
}: OnboardingWizardProps) {
  const router = useRouter()
  const t = useTranslations('onboarding')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [schoolName, setSchoolName] = useState(currentSettings.site_name?.value || '')
  const [schoolDescription, setSchoolDescription] = useState(currentSettings.site_description?.value || '')

  // Skip the school step if the name was already set during school creation
  const hasSchoolName = !!currentSettings.site_name?.value
  const STEPS = hasSchoolName
    ? ALL_STEPS.filter(s => s !== 'school')
    : ALL_STEPS

  const [currentStep, setCurrentStep] = useState<Step>('welcome')
  const [isConnectingStripe, setIsConnectingStripe] = useState(false)

  const stepIndex = (STEPS as readonly Step[]).indexOf(currentStep)

  // The picker refreshes the route after it saves, so `storedTheme` is already
  // the new choice by the Ready step. Resolved like the layout, so the summary
  // names what the school actually renders on its plan.
  const renderedTheme = resolveSchoolTheme(storedTheme, { customBranding })
  const themeSummary = renderedTheme
    ? `${KIT_THEMES[renderedTheme.theme].name} · ${
        KIT_THEMES[renderedTheme.theme].swatches.find((s) => s.hex === renderedTheme.brand)?.name ??
        renderedTheme.brand
      }`
    : t('ready.themeDefault')

  function goNext() {
    const nextIndex = stepIndex + 1
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex] as Step)
    }
  }

  function goBack() {
    const prevIndex = stepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex] as Step)
    }
  }

  async function handleComplete() {
    setIsSubmitting(true)
    try {
      const result = await completeOnboarding({
        schoolName: schoolName || 'My School',
        schoolDescription: schoolDescription || 'An online learning platform',
      })

      if (result.success) {
        toast.success(t('complete.success'))
        router.push(redirectTo)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('complete.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSkipToCreate() {
    setIsSubmitting(true)
    try {
      const result = await completeOnboarding({
        schoolName: schoolName || 'My School',
        schoolDescription: schoolDescription || 'An online learning platform',
      })

      if (result.success) {
        router.push('/dashboard/admin/courses/new')
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('complete.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    // The branding step is wider: the picker sets its phone preview beside the controls.
    <div className={cn('w-full', currentStep === 'branding' ? 'max-w-4xl' : 'max-w-2xl')}>
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full transition-all ${
                i <= stepIndex
                  ? 'bg-primary scale-110'
                  : 'bg-muted-foreground'
              }`}
            />
            {i < STEPS.length - 1 && (
              <div
                className={`w-12 h-0.5 transition-all ${
                  i < stepIndex ? 'bg-primary' : 'bg-muted-foreground'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step: Welcome */}
      {currentStep === 'welcome' && (
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-16 h-16 bg-brand-tint rounded-2xl flex items-center justify-center border border-primary/20">
              <Sparkles className="w-8 h-8 text-brand-text" />
            </div>
            <CardTitle className="text-3xl">
              {t('welcome.title', { name: userName })}
            </CardTitle>
            <CardDescription className="text-lg mt-2">
              {t('welcome.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-4">
              {[
                { icon: GraduationCap, text: t('welcome.step1') },
                { icon: Palette, text: t('welcome.step2') },
                { icon: Rocket, text: t('welcome.step3') },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="w-10 h-10 rounded-lg bg-brand-tint flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-brand-text" />
                  </div>
                  <p className="text-foreground">{text}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={goNext}
                size="lg"
              >
                {t('welcome.getStarted')}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: School Info */}
      {currentStep === 'school' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand-tint rounded-xl flex items-center justify-center border border-primary/20">
                <GraduationCap className="w-5 h-5 text-brand-text" />
              </div>
              <div>
                <CardTitle className="text-xl">{t('school.title')}</CardTitle>
                <CardDescription>{t('school.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="schoolName">{t('school.nameLabel')}</Label>
              <Input
                id="schoolName"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder={t('school.namePlaceholder')}
              />
              <p className="text-sm text-muted-foreground">{t('school.nameHint')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schoolDescription">{t('school.descriptionLabel')}</Label>
              <Textarea
                id="schoolDescription"
                value={schoolDescription}
                onChange={(e) => setSchoolDescription(e.target.value)}
                placeholder={t('school.descriptionPlaceholder')}
                rows={3}
              />
              <p className="text-sm text-muted-foreground">{t('school.descriptionHint')}</p>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={goBack} className="text-muted-foreground">
                <ArrowLeft className="mr-2 w-4 h-4" />
                {t('back')}
              </Button>
              <Button
                onClick={goNext}
                disabled={!schoolName.trim()}
              >
                {t('next')}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Branding / Appearance */}
      {currentStep === 'branding' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand-tint rounded-xl flex items-center justify-center border border-primary/20">
                <Palette className="w-5 h-5 text-brand-text" />
              </div>
              <div>
                <CardTitle className="text-xl">{t('branding.title')}</CardTitle>
                <CardDescription>{t('branding.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ThemeKitPicker
              variant="onboarding"
              stored={storedTheme}
              customBranding={customBranding}
              onContinue={goNext}
              onBack={goBack}
            />
          </CardContent>
        </Card>
      )}

      {/* Step: Payment Setup */}
      {currentStep === 'payment' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand-tint rounded-xl flex items-center justify-center border border-primary/20">
                <CreditCard className="w-5 h-5 text-brand-text" />
              </div>
              <div>
                <CardTitle className="text-xl">{t('payment.title')}</CardTitle>
                <CardDescription>{t('payment.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Why Connect */}
            <div className="rounded-xl border border-primary/20 bg-brand-tint p-5">
              <div className="flex items-start gap-3 mb-3">
                <DollarSign className="w-5 h-5 text-brand-text mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">{t('payment.whyTitle')}</h4>
                  <p className="text-sm text-foreground/80">{t('payment.whyDescription')}</p>
                </div>
              </div>
              <ul className="space-y-2 ml-8">
                {[
                  t('payment.benefit1'),
                  t('payment.benefit2'),
                  t('payment.benefit3'),
                  t('payment.benefit4'),
                ].map((benefit, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start">
                    <span className="text-brand-text mr-2">•</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Revenue Split Info */}
            <div className="rounded-xl border border-border p-5 bg-muted/30">
              <h4 className="font-semibold mb-3">{t('payment.revenueSplit')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-success/10 border border-success/30">
                  <div className="text-3xl font-bold text-success">80%</div>
                  <div className="text-xs text-foreground mt-1">{t('payment.yourRevenue')}</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted border border-border">
                  <div className="text-3xl font-bold text-muted-foreground">20%</div>
                  <div className="text-xs text-foreground mt-1">{t('payment.platformFee')}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {t('payment.revenueSplitNote')}
              </p>
            </div>

            {/* Connect Button */}
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setIsConnectingStripe(true)
                  window.location.href = '/api/stripe/connect'
                }}
                className="w-full h-12"
                disabled={isConnectingStripe}
                size="lg"
              >
                {isConnectingStripe ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-5 w-5" />
                )}
                {t('payment.connectStripe')}
              </Button>

              {/* Manual payments always work — skipping Stripe is a valid path, not a warning (#438) */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  {t('payment.skipWarning')}
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-border">
              <Button variant="ghost" onClick={goBack} className="text-muted-foreground">
                <ArrowLeft className="mr-2 w-4 h-4" />
                {t('back')}
              </Button>
              <Button
                onClick={goNext}
                variant="outline"
              >
                {t('payment.skipForNow')}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Ready */}
      {currentStep === 'ready' && (
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center border border-success/30">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">{t('ready.title')}</CardTitle>
            <CardDescription className="text-lg mt-2">
              {t('ready.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            {/* Summary */}
            <div className="rounded-xl border border-border p-5 bg-muted/30 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">{t('school.nameLabel')}</span>
                <span className="text-foreground font-medium">{schoolName || 'My School'}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-muted-foreground text-sm">{t('ready.theme')}</span>
                <span className="text-foreground text-sm text-right" data-testid="onboarding-ready-theme">
                  {themeSummary}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={handleSkipToCreate}
                className="w-full h-12 text-base"
                disabled={isSubmitting}
                size="lg"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="mr-2 w-4 h-4" />
                )}
                {t('ready.createCourse')}
              </Button>
              <Button
                onClick={handleComplete}
                variant="ghost"
                className="w-full text-muted-foreground"
                disabled={isSubmitting}
              >
                {t('ready.goToDashboard')}
              </Button>
            </div>

            <Button
              variant="ghost"
              onClick={goBack}
              className="text-muted-foreground"
              size="sm"
            >
              <ArrowLeft className="mr-2 w-3 h-3" />
              {t('back')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
