'use client'

import { Render } from '@measured/puck'
import type { Data } from '@measured/puck'
import { createPuckConfig } from '@/lib/puck/config'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

interface Props {
  data: Data
}

export function PuckPageRenderer({ data }: Props) {
  const t = useTranslations('puck')
  const config = useMemo(() => createPuckConfig(t), [t])
  return (
    <div className="min-h-screen">
      <Render config={config} data={data} />
    </div>
  )
}
