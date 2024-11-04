'use client'
import confetti from 'canvas-confetti'
import { Star } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { ConfettiRef } from '@/components/magicui/confetti'

export default function CompletedMessage() {
    const t = useScopedI18n('CompletedMessage')

    const confettiRef = useRef<ConfettiRef>(null)
    const handleClick = () => {
        const duration = 5 * 1000
        const animationEnd = Date.now() + duration
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

        const randomInRange = (min: number, max: number) =>
            Math.random() * (max - min) + min

        const interval = window.setInterval(() => {
            const timeLeft = animationEnd - Date.now()

            if (timeLeft <= 0) {
                return clearInterval(interval)
            }

            const particleCount = 50 * (timeLeft / duration)
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
            })
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
            })
        }, 250)
    }

    useEffect(() => {
        handleClick()
    }
    , [])
    return (
        <div className="flex flex-col gap-4 items-center justify-center">
            <div className="flex items-center space-x-2">
                <h4 className="text-lg font-semibold text-green-500">
                    {t('title')}
                </h4>
                <Star className="w-6 h-6 text-yellow-500" />
            </div>
            <p className="text-md text-muted-foreground">
                {t('description')}
            </p>
        </div>
    )
}
