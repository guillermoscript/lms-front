'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GuidedTour } from './guided-tour'
import { getCommunityTour } from './tour-definitions'
import { TourTrigger } from './tour-trigger'

const TOUR_ID = 'community'

interface CommunityTourProps {
  userId: string
  userRole: 'student' | 'teacher' | 'admin'
}

export function CommunityTour({ userId, userRole }: CommunityTourProps) {
  const t = useTranslations('community')
  const [restartKey, setRestartKey] = useState(0)

  const steps = getCommunityTour(t, userRole)

  const handleRestart = useCallback(() => {
    setRestartKey((k) => k + 1)
  }, [])

  return (
    <>
      <TourTrigger
        tourId={TOUR_ID}
        userId={userId}
        onRestart={handleRestart}
      />
      <GuidedTour
        key={restartKey}
        tourId={TOUR_ID}
        userId={userId}
        steps={steps}
      />
    </>
  )
}
