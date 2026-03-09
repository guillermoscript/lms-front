'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GuidedTour } from './guided-tour'
import { getAdminDashboardTour } from './tour-definitions'
import { TourTrigger } from './tour-trigger'

const TOUR_ID = 'admin-dashboard'

interface AdminDashboardTourProps {
  userId: string
}

export function AdminDashboardTour({ userId }: AdminDashboardTourProps) {
  const t = useTranslations('dashboard.admin.main')
  const [restartKey, setRestartKey] = useState(0)

  const steps = getAdminDashboardTour(t)

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
