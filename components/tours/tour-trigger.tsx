'use client'

import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
interface TourTriggerProps {
  onRestart: () => void
}

export function TourTrigger({ onRestart }: TourTriggerProps) {
  const t = useTranslations('common.tour')

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRestart}
            className="text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="size-4" />
            <span className="sr-only">{t('replay')}</span>
          </Button>
        }
      />
      <TooltipContent>{t('replay')}</TooltipContent>
    </Tooltip>
  )
}
