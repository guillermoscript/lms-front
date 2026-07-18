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
  completed?: boolean
  toursEnabled?: boolean
}

export function CommunityTour({ userId, userRole, completed, toursEnabled }: CommunityTourProps) {
  const t = useTranslations('community')
  const [restartKey, setRestartKey] = useState(0)

  const steps = getCommunityTour(t, userRole)

  const handleRestart = useCallback(() => {
    setRestartKey((k) => k + 1)
  }, [])

  return (
    <>
      {toursEnabled !== false && (
        <TourTrigger onRestart={handleRestart} />
      )}
      <GuidedTour
        key={restartKey}
        forceStart={restartKey > 0}
        tourId={TOUR_ID}
        userId={userId}
        steps={steps}
        completed={completed}
        toursEnabled={toursEnabled}
      />
    </>
  )
}
