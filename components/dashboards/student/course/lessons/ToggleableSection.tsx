'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ToggleableSection = ({ title, children, isOpen }: { title: JSX.Element; children: JSX.Element; isOpen: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(isOpen)
    const toggle = () => setIsExpanded(!isExpanded)

    return (
        <Card className="mt-8">
            <CardHeader className="flex justify-between items-center cursor-pointer md:cursor-default md:flex-row gap-2 md:justify-between" onClick={toggle}>
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
                        <CardContent>{children}</CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}

export default ToggleableSection
