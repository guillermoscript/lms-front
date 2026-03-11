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
import { OnboardingAppearanceStep } from './onboarding-appearance-step'
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
  currentSettings: Record<string, any>
  redirectTo?: string
}

const STEPS = ['welcome', 'school', 'branding', 'payment', 'ready'] as const
type Step = typeof STEPS[number]

export default function OnboardingWizard({ userId, userName, currentSettings, redirectTo = '/dashboard/admin' }: OnboardingWizardProps) {
  const router = useRouter()
  const t = useTranslations('onboarding')
  const [currentStep, setCurrentStep] = useState<Step>('welcome')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [schoolName, setSchoolName] = useState(currentSettings.site_name?.value || '')
  const [schoolDescription, setSchoolDescription] = useState(currentSettings.site_description?.value || '')
  const [isConnectingStripe, setIsConnectingStripe] = useState(false)

  const stepIndex = STEPS.indexOf(currentStep)

  function goNext() {
    const nextIndex = stepIndex + 1
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex])
    }
  }

  function goBack() {
    const prevIndex = stepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex])
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
        router.push('/dashboard/teacher/courses/new')
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
    <div className="w-full max-w-2xl">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full transition-all ${
                i <= stepIndex
                  ? 'bg-blue-500 scale-110'
                  : 'bg-zinc-700'
              }`}
            />
            {i < STEPS.length - 1 && (
              <div
                className={`w-12 h-0.5 transition-all ${
                  i < stepIndex ? 'bg-blue-500' : 'bg-zinc-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step: Welcome */}
      {currentStep === 'welcome' && (
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
              <Sparkles className="w-8 h-8 text-blue-400" />
            </div>
            <CardTitle className="text-3xl text-white">
              {t('welcome.title', { name: userName })}
            </CardTitle>
            <CardDescription className="text-zinc-400 text-lg mt-2">
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
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <p className="text-zinc-300">{text}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={goNext}
                className="bg-blue-600 hover:bg-blue-500 text-white"
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
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                <GraduationCap className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-xl text-white">{t('school.title')}</CardTitle>
                <CardDescription className="text-zinc-400">{t('school.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="schoolName" className="text-zinc-300">{t('school.nameLabel')}</Label>
              <Input
                id="schoolName"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder={t('school.namePlaceholder')}
                className="bg-zinc-800/50 border-zinc-700 text-white"
              />
              <p className="text-sm text-zinc-500">{t('school.nameHint')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schoolDescription" className="text-zinc-300">{t('school.descriptionLabel')}</Label>
              <Textarea
                id="schoolDescription"
                value={schoolDescription}
                onChange={(e) => setSchoolDescription(e.target.value)}
                placeholder={t('school.descriptionPlaceholder')}
                rows={3}
                className="bg-zinc-800/50 border-zinc-700 text-white"
              />
              <p className="text-sm text-zinc-500">{t('school.descriptionHint')}</p>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={goBack} className="text-zinc-400 hover:text-white">
                <ArrowLeft className="mr-2 w-4 h-4" />
                {t('back')}
              </Button>
              <Button
                onClick={goNext}
                className="bg-blue-600 hover:bg-blue-500 text-white"
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
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20">
                <Palette className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-xl text-white">{t('branding.title')}</CardTitle>
                <CardDescription className="text-zinc-400">
                  Pick a color theme, font, and border radius for your school
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <OnboardingAppearanceStep onComplete={goNext} onBack={goBack} />
          </CardContent>
        </Card>
      )}

      {/* Step: Payment Setup */}
      {currentStep === 'payment' && (
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center border border-green-500/20">
                <CreditCard className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-xl text-white">{t('payment.title')}</CardTitle>
                <CardDescription className="text-zinc-400">{t('payment.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Why Connect */}
            <div className="rounded-xl border border-blue-800/50 bg-blue-900/20 p-5">
              <div className="flex items-start gap-3 mb-3">
                <DollarSign className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-white mb-1">{t('payment.whyTitle')}</h4>
                  <p className="text-sm text-zinc-400">{t('payment.whyDescription')}</p>
                </div>
              </div>
              <ul className="space-y-2 ml-8">
                {[
                  t('payment.benefit1'),
                  t('payment.benefit2'),
                  t('payment.benefit3'),
                  t('payment.benefit4'),
                ].map((benefit, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex items-start">
                    <span className="text-blue-400 mr-2">•</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Revenue Split Info */}
            <div className="rounded-xl border border-zinc-800 p-5 bg-zinc-800/20">
              <h4 className="font-semibold text-white mb-3">{t('payment.revenueSplit')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-3xl font-bold text-emerald-400">80%</div>
                  <div className="text-xs text-zinc-400 mt-1">{t('payment.yourRevenue')}</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-zinc-700/30 border border-zinc-700">
                  <div className="text-3xl font-bold text-zinc-400">20%</div>
                  <div className="text-xs text-zinc-500 mt-1">{t('payment.platformFee')}</div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-3 text-center">
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
                className="w-full bg-[#635BFF] hover:bg-[#5851EA] text-white h-12"
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

              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-300">
                  {t('payment.skipWarning')}
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-zinc-800">
              <Button variant="ghost" onClick={goBack} className="text-zinc-400 hover:text-white">
                <ArrowLeft className="mr-2 w-4 h-4" />
                {t('back')}
              </Button>
              <Button
                onClick={goNext}
                variant="outline"
                className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
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
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl text-white">{t('ready.title')}</CardTitle>
            <CardDescription className="text-zinc-400 text-lg mt-2">
              {t('ready.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            {/* Summary */}
            <div className="rounded-xl border border-zinc-800 p-5 bg-zinc-800/20 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 text-sm">{t('school.nameLabel')}</span>
                <span className="text-white font-medium">{schoolName || 'My School'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 text-sm">Theme</span>
                <span className="text-white text-sm">Customized via Appearance</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={handleSkipToCreate}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white h-12 text-base"
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
                className="w-full text-zinc-400 hover:text-white"
                disabled={isSubmitting}
              >
                {t('ready.goToDashboard')}
              </Button>
            </div>

            <Button
              variant="ghost"
              onClick={goBack}
              className="text-zinc-500 hover:text-zinc-300"
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
