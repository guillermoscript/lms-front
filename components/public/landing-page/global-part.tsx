'use client'

import { Render } from '@measured/puck'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { createPuckConfig } from '@/lib/puck/config'
import type { GlobalPart } from '@/lib/puck/utils/global-parts'

/** One global header/footer block, rendered through the same Puck config the pages use. */
export function GlobalPartView({ part }: { part: GlobalPart }) {
  const t = useTranslations('puck')
  const config = useMemo(() => createPuckConfig(t), [t])
  const data = useMemo(
    () => ({ root: { props: {} }, content: [{ type: part.type, props: { id: `global-${part.type}`, ...part.props } }] }),
    [part],
  )
  return (
    <div data-global-part={part.type.toLowerCase()}>
      <Render config={config} data={data} />
    </div>
  )
}
