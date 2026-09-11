'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Check } from 'lucide-react'
import { joinCurrentSchool } from '@/app/actions/join-school'

interface JoinSchoolFormProps {
  tenant: {
    id: string
    name: string
    slug: string
    description?: string
  }
  /**
   * Same-origin path to land on after a successful join. The page resolves it
   * (a sanitised `next` such as `/checkout?courseId=42`, or the student
   * dashboard) so a purchase or enroll intent survives the join step (#684).
   */
  destination: string
}

export function JoinSchoolForm({ tenant, destination }: JoinSchoolFormProps) {
  const t = useTranslations('joinSchool')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    setIsJoining(true)
    setError(null)

    try {
      const result = await joinCurrentSchool()

      if (!result.success) {
        setError(result.error || t('error'))
        setIsJoining(false)
        return
      }

      // Hard navigation, not router.push + router.refresh: the pair interleaves
      // two Router transitions and crashes Next's app-router with React #310
      // (LMS-FRONT-9K/8F, upstream vercel/next.js#78396) — and the membership
      // just changed, so a full request through proxy.ts with fresh claims is
      // what we want anyway. The button stays disabled until the page unloads.
      window.location.assign(destination)
    } catch (err) {
      console.error('Join error:', err)
      setError(t('unexpectedError'))
      setIsJoining(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('formTitle')}</CardTitle>
        <CardDescription>{t('formDescription', { school: tenant.name })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tenant.description && (
          <div className="text-sm text-muted-foreground p-4 bg-muted rounded-md">
            {tenant.description}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-medium text-sm">{t('benefitsTitle')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              {t('benefitCourses')}
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              {t('benefitProgress')}
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              {t('benefitExams')}
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              {t('benefitCommunity')}
            </li>
          </ul>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleJoin}
          disabled={isJoining}
          className="w-full"
          size="lg"
          data-testid="join-school-submit"
        >
          {isJoining ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            <>{t('submit', { school: tenant.name })}</>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          {t('terms', { school: tenant.name })}
        </p>
      </CardContent>
    </Card>
  )
}
