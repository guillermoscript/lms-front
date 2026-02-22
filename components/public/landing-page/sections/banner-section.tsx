'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { BannerSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: BannerSectionData
}

const STYLE_CLASSES: Record<string, string> = {
  info: 'bg-blue-600/20 border-blue-500/30 text-blue-100',
  warning: 'bg-amber-600/20 border-amber-500/30 text-amber-100',
  urgent: 'bg-red-600/20 border-red-500/30 text-red-100',
  celebration: 'bg-purple-600/20 border-purple-500/30 text-purple-100',
}

const BUTTON_CLASSES: Record<string, string> = {
  info: 'bg-blue-600 hover:bg-blue-500',
  warning: 'bg-amber-600 hover:bg-amber-500',
  urgent: 'bg-red-600 hover:bg-red-500',
  celebration: 'bg-purple-600 hover:bg-purple-500',
}

function useCountdown(targetDate: string) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!targetDate) return
    const target = new Date(targetDate).getTime()
    if (isNaN(target)) return

    function tick() {
      const now = Date.now()
      const diff = target - now
      if (diff <= 0) { setTimeLeft(''); return }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setTimeLeft(
        days > 0
          ? `${days}d ${hours}h ${mins}m`
          : `${hours}h ${mins}m ${secs}s`
      )
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return timeLeft
}

export function BannerSection({ data }: Props) {
  const countdown = useCountdown(data.countdownDate)
  const styleClass = STYLE_CLASSES[data.style] || STYLE_CLASSES.info
  const btnClass = BUTTON_CLASSES[data.style] || BUTTON_CLASSES.info

  return (
    <section className={`border-y ${styleClass}`}>
      <div className="container mx-auto px-4 md:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left">
          <p className="font-medium text-sm md:text-base">{data.text}</p>
          {countdown && (
            <span className="font-mono text-sm tabular-nums opacity-80">{countdown}</span>
          )}
          {data.ctaText && data.ctaLink && (
            <Link href={data.ctaLink}>
              <Button size="sm" className={`text-white border-0 ${btnClass}`}>
                {data.ctaText}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
