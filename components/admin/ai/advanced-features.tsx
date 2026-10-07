'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconChevronDown } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AiFeatureDTO, AiProviderDTO } from '@/app/actions/admin/ai-settings'

import { FeatureRow } from './feature-row'

const AREAS = ['student', 'teacher', 'admin'] as const

interface AdvancedFeaturesProps {
  features: AiFeatureDTO[]
  providers: AiProviderDTO[]
}

/** Per-feature model selection, grouped by who uses the feature. Collapsed by default (progressive disclosure). */
export function AdvancedFeatures({ features, providers }: AdvancedFeaturesProps) {
  const t = useTranslations('aiSettings')
  // Open straight away when something is already customised, so existing choices are never hidden.
  const [open, setOpen] = useState(() => features.some((f) => f.mapping))

  return (
    <Card data-testid="ai-advanced">
      <CardHeader>
        <CardTitle>{t('advanced.title')}</CardTitle>
        <CardDescription>{t('advanced.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="ai-advanced-panel"
        >
          <IconChevronDown className={open ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden />
          {open ? t('advanced.hide') : t('advanced.show')}
        </Button>

        {open && (
          <div id="ai-advanced-panel" className="space-y-6 pt-4">
            {AREAS.map((area) => {
              const rows = features.filter((f) => f.area === area)
              if (rows.length === 0) return null
              return (
                <section key={area} aria-labelledby={`ai-area-${area}`}>
                  <h3 id={`ai-area-${area}`} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`advanced.areas.${area}`)}
                  </h3>
                  <div className="divide-y">
                    {rows.map((feature) => (
                      <FeatureRow
                        // Remount when the saved mapping changes so drafts never shadow fresh server data.
                        key={`${feature.feature}:${feature.mapping?.provider ?? ''}:${feature.mapping?.model ?? ''}:${JSON.stringify(feature.mapping?.params ?? {})}`}
                        feature={feature}
                        providers={providers}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
