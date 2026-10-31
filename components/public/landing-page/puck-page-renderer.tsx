'use client'

import { Render } from '@measured/puck'
import type { Data } from '@measured/puck'
import { createPuckConfig } from '@/lib/puck/config'
import type { LandingData } from '@/lib/puck/types'
import { withDefaultAnchors } from '@/lib/puck/utils/section-style'
import { pageUsesGlobalParts, stripGlobalParts, type GlobalParts } from '@/lib/puck/utils/global-parts'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

interface Props {
  data: Data
  landingData?: Partial<LandingData>
  /** The layout renders the school's global header/footer: drop the page's own copies. */
  globalParts?: GlobalParts | null
}

export function PuckPageRenderer({ data, landingData, globalParts = null }: Props) {
  const t = useTranslations('puck')
  const config = useMemo(() => createPuckConfig(t), [t])
  const metadata = useMemo(() => ({ ...landingData }), [landingData])
  // `#faq` / `#pricing` / `#contact`… links land on the first block of that type.
  const hasGlobalParts = !!(globalParts?.header || globalParts?.footer)
  const usesGlobal = hasGlobalParts && pageUsesGlobalParts(data)
  const anchored = useMemo(
    () => withDefaultAnchors(usesGlobal ? stripGlobalParts(data, globalParts!) : data),
    [data, usesGlobal, globalParts],
  )
  return (
    <div className="min-h-screen">
      {/* A page that opted out keeps its own blocks and hides the layout's. */}
      {hasGlobalParts && !usesGlobal && <style>{'[data-global-part]{display:none}'}</style>}
      <Render config={config} data={anchored} metadata={metadata} />
    </div>
  )
}
