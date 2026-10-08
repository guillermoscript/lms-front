'use client'

import { Render } from '@measured/puck'
import type { Data } from '@measured/puck'
import { createPuckConfig } from '@/lib/puck/config'
import type { LandingData } from '@/lib/puck/types'
import { withDefaultAnchors } from '@/lib/puck/utils/section-style'
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
  // `#faq` / `#pricing` / `#contact`… links land on the first block of that type.
  const anchored = useMemo(() => withDefaultAnchors(data), [data])
  return (
    <div className="min-h-screen">
      <Render config={config} data={anchored} metadata={metadata} />
    </div>
  )
}
