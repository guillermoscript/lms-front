'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GuidedTour } from './guided-tour'
import { getLessonEditorTour } from './tour-definitions'
import { TourTrigger } from './tour-trigger'

const TOUR_ID = 'lesson-editor'

interface LessonEditorTourProps {
  userId: string
}

export function LessonEditorTour({ userId }: LessonEditorTourProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor')
  const [restartKey, setRestartKey] = useState(0)

  const steps = getLessonEditorTour(t)

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
