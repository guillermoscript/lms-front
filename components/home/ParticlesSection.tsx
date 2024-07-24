'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import Particles from '../magicui/particles'

export default function ParticlesSection({ children }: { children: React.ReactNode }) {
    const { theme } = useTheme()
    const [color, setColor] = useState('#ffffff')

    useEffect(() => {
        setColor(theme === 'dark' ? '#ffffff' : '#000000')
    }, [theme])

    return (
        <>
            {children}
            <Particles
                className="absolute inset-0"
                quantity={100}
                ease={80}
                color={color}
                refresh
            />
        </>
    )
}
