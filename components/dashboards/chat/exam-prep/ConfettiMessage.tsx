'use client'

import { useEffect, useRef } from 'react'

import Confetti, { ConfettiRef } from '@/components/magicui/confetti'

export default function ConfettiMessage() {
    const confettiRef = useRef<ConfettiRef>(null)

    useEffect(() => {
        confettiRef.current?.fire({})
    }
    , [])
    return (
        <Confetti
            ref={confettiRef}
            className="absolute left-0 top-0 z-0 size-full"
        />
    )
}
