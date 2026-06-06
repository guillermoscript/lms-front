'use client'

import { Render } from '@measured/puck'
import type { Data } from '@measured/puck'
import { createPuckConfig } from '@/lib/puck/config'
import type { LandingCourse } from '@/lib/puck/types'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

interface Props {
  data: Data
  courses?: LandingCourse[]
}

export function PuckPageRenderer({ data, courses = [] }: Props) {
  const t = useTranslations('puck')
  const config = useMemo(() => createPuckConfig(t), [t])
  const metadata = useMemo(() => ({ courses }), [courses])
  return (
    <div className="min-h-screen">
      <Render config={config} data={data} metadata={metadata} />
    </div>
  )
}
