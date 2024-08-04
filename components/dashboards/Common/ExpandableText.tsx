'use client'
import React, { useState } from 'react'

interface ExpandableTextProps {
    text: string;
    maxLength: number;
}

const ExpandableText: React.FC<ExpandableTextProps> = ({ text, maxLength }) => {
    const [isExpanded, setIsExpanded] = useState(false)

    const toggleExpansion = () => {
        setIsExpanded(!isExpanded)
    }

    const shouldShowButton = text.length > maxLength

    return (
        <>

            {isExpanded ? text : `${text.substring(0, maxLength)}${shouldShowButton ? '...' : ''}`}

            {shouldShowButton && (
                <button
                    onClick={toggleExpansion}
                    className="text-blue-500 hover:underline focus:outline-none ml-1"
                >
                    {isExpanded ? 'View Less' : 'View More'}
                </button>
            )}
        </>
    )
}

export default ExpandableText
