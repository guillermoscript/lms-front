'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils'

const ToggleableSection = ({
    title,
    children,
    isOpen,
    cardClassName,
    cardContentClassName,
}: {
    title: JSX.Element
    children: JSX.Element
    isOpen: boolean
    cardClassName?: string
    cardContentClassName?: string
}) => {
    const [isExpanded, setIsExpanded] = useState(isOpen)
    const toggle = () => setIsExpanded(!isExpanded)

    return (
        <Card className={cn('mt-8', cardClassName)}>
            <CardHeader
                className="flex justify-between items-center cursor-pointer md:cursor-default flex-row gap-2"
                onClick={toggle}
            >
                <CardTitle className="text-2xl">{title}</CardTitle>
                {isExpanded ? <ChevronUp /> : <ChevronDown />}
            </CardHeader>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <CardContent className={cardContentClassName}>
                            {children}
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}

export default ToggleableSection
