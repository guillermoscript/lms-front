'use client'

import { createContext, use, useState, useCallback, type ReactNode } from 'react'

interface AristotleContextValue {
    isOpen: boolean
    isEnabled: boolean
    courseId: number
    personaName: string | null
    contextPage: string | null
    contextLabel: string | null
    open: () => void
    close: () => void
    toggle: () => void
    setContextPage: (page: string | null) => void
    setContextLabel: (label: string | null) => void
}

const AristotleContext = createContext<AristotleContextValue | null>(null)

export function useAristotle() {
    const ctx = use(AristotleContext)
    if (!ctx) throw new Error('useAristotle must be used within AristotleProvider')
    return ctx
}

export function useAristotleOptional() {
    return use(AristotleContext)
}

interface AristotleProviderProps {
    children: ReactNode
    courseId: number
    isEnabled: boolean
    personaName?: string | null
}

export function AristotleProvider({ children, courseId, isEnabled, personaName }: AristotleProviderProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [contextPage, setContextPage] = useState<string | null>(null)
    const [contextLabel, setContextLabel] = useState<string | null>(null)

    const open = useCallback(() => setIsOpen(true), [])
    const close = useCallback(() => setIsOpen(false), [])
    const toggle = useCallback(() => setIsOpen(prev => !prev), [])

    return (
        <AristotleContext.Provider
            value={{
                isOpen,
                isEnabled,
                courseId,
                personaName: personaName || null,
                contextPage,
                contextLabel,
                open,
                close,
                toggle,
                setContextPage,
                setContextLabel,
            }}
        >
            {children}
        </AristotleContext.Provider>
    )
}
