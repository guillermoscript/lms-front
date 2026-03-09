'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GuidedTour } from './guided-tour'
import { getTeacherDashboardTour } from './tour-definitions'
import { TourTrigger } from './tour-trigger'

const TOUR_ID = 'teacher-dashboard'

interface TeacherDashboardTourProps {
  userId: string
}

export function TeacherDashboardTour({ userId }: TeacherDashboardTourProps) {
  const t = useTranslations('dashboard.teacher')
  const [restartKey, setRestartKey] = useState(0)

  const steps = getTeacherDashboardTour(t)

  const handleRestart = useCallback(() => {
    setRestartKey((k) => k + 1)
  }, [])

  return (
    <>
      <div className="fixed right-4 top-4 z-40">
        <TourTrigger
          tourId={TOUR_ID}
          userId={userId}
          onRestart={handleRestart}
        />
      </div>
      <GuidedTour
        key={restartKey}
        tourId={TOUR_ID}
        userId={userId}
        steps={steps}
      />
    </>
  )
}
