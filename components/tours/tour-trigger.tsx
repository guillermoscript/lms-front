'use client'

import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { clearTourCompleted } from './guided-tour'

interface TourTriggerProps {
  tourId: string
  userId: string
  onRestart: () => void
}

export function TourTrigger({ tourId, userId, onRestart }: TourTriggerProps) {
  function handleClick() {
    clearTourCompleted(tourId, userId)
    onRestart()
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClick}
            className="text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="size-4" />
            <span className="sr-only">Replay tour</span>
          </Button>
        }
      />
      <TooltipContent>Replay tour</TooltipContent>
    </Tooltip>
  )
}
