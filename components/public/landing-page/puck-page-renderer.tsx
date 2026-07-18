'use client'

import { Render } from '@measured/puck'
import type { Data } from '@measured/puck'
import { createPuckConfig } from '@/lib/puck/config'
import type { LandingData } from '@/lib/puck/types'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

interface Props {
  data: Data
  landingData?: Partial<LandingData>
}

export function PuckPageRenderer({ data, landingData }: Props) {
  const t = useTranslations('puck')
  const config = useMemo(() => createPuckConfig(t), [t])
  const metadata = useMemo(() => ({ ...landingData }), [landingData])
  return (
    <div className="min-h-screen">
      <Render config={config} data={data} metadata={metadata} />
    </div>
  )
}
