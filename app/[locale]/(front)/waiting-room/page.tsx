'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'

const WaitingRoom = () => {
    const [waitTime, setWaitTime] = useState(60)

    const t = useScopedI18n('waitingRoom')
    const router = useRouter()

    function onComplete() {
        // Redirect to the home page after the wait time is over.
        router.push('/')
    }

    useEffect(() => {
        const timer = setInterval(() => {
            setWaitTime((prevTime) => {
                if (prevTime <= 1) {
                    clearInterval(timer)
                    onComplete()
                    return 0
                }
                return prevTime - 1
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [onComplete])

    const minutes = Math.floor(waitTime / 60)
    const seconds = waitTime % 60

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 w-full">
            <div
                className="text-center max-w-2xl"
            >
                <h1 className="text-4xl font-bold mb-4 text-primary">
                    {t('title')}
                </h1>
                <p className="text-xl mb-8 text-foreground">
                    {t('description')}
                </p>
                <div className="mb-8">
                    <Loader2 className="animate-spin h-12 w-12 text-primary mx-auto" />
                </div>
                <p className="text-2xl font-semibold mb-4 text-foreground">
                    {t('waitTime')} : {minutes}:{seconds.toString().padStart(2, '0')}
                </p>
                <p className="text-muted-foreground">
                    {t('waitDescription')}
                </p>
            </div>
        </div>
    )
}

export default WaitingRoom
