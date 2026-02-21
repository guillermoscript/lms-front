'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
}

export function JoinSchoolForm({ tenant }: JoinSchoolFormProps) {
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleJoin = async () => {
    setIsJoining(true)
    setError(null)

    try {
      const result = await joinCurrentSchool()

      if (!result.success) {
        setError(result.error || 'Failed to join school. Please try again.')
        return
      }

      // Redirect to student dashboard
      router.push('/dashboard/student')
      router.refresh()
    } catch (err) {
      console.error('Join error:', err)
      setError('An unexpected error occurred')
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready to Start Learning?</CardTitle>
        <CardDescription>
          Join {tenant.name} and get access to their courses and resources
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tenant.description && (
          <div className="text-sm text-muted-foreground p-4 bg-muted rounded-md">
            {tenant.description}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-medium text-sm">What you'll get:</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Access to all available courses
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Track your progress and earn certificates
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Participate in exams and exercises
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Join the learning community
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
        >
          {isJoining ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : (
            <>Join {tenant.name}</>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          By joining, you agree to {tenant.name}&apos;s terms of service and privacy policy
        </p>
      </CardContent>
    </Card>
  )
}
