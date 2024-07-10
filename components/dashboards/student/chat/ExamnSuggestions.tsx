'use client'

import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { AI } from '@/actions/dashboard/ExamPreparationActions'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils'

import ChatLoadingSkeleton from './ChatLoadingSkeleton'

interface ExamSuggestion {
    title: string
    description: string
    content: string
    difficulty: string

}

export default function ExamnSuggestions ({
    suggestions,
    disabled
}: {
    suggestions: ExamSuggestion[]
    disabled?: boolean
}) {
    const [isLoading, setIsLoading] = useState(false)
    const { continueConversation } = useActions()
    const [_, setMessages] = useUIState<typeof AI>()
    const [selectedSuggestion, setSelectedSuggestion] = useState<ExamSuggestion | null>(null)

    async function onSuggestionClick (suggestion: ExamSuggestion) {
        setIsLoading(true)
        try {
            const message = `Help me creating an exam form for ${suggestion.title}
            ---
            # Exam Form
            title: ${suggestion.title}
            description: ${suggestion.description}
            content: ${suggestion.content}
            difficulty: ${suggestion.difficulty}`

            const { display } = await continueConversation(message)

            setMessages((messages) => {
                console.log('messages', messages)
                return [...messages, {
                    id: generateId(),
                    display
                }]
            })
            setSelectedSuggestion(suggestion)
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) {
        return (
            <ChatLoadingSkeleton />
        )
    }

    return (
        <div className="flex flex-col gap-4 w-full my-4">
            <h1 className="text-2xl font-semibold">
                Exam Suggestions
            </h1>
            <div className="flex flex-wrap gap-4 w-full">
                {suggestions.map((suggestion, index) => (

                    <button
                        key={index}
                        onClick={async () => await onSuggestionClick(suggestion)}
                        className={
                            cn(
                                'flex flex-col flex-1 shrink-0 justify-between p-5 px-6 rounded-3xl transition group border',
                                selectedSuggestion?.title === suggestion.title && 'border-primary',
                                selectedSuggestion === null && 'hover:shadow-md hover:scale-105',
                                (selectedSuggestion !== null || disabled) && 'border-gray-200 opacity-50 cursor-not-allowed'

                            )
                        }
                        disabled={disabled || selectedSuggestion !== null}

                    >
                        <div className="flex flex-col text-left gap-2">
                            <div className={'font-medium transition'}>{suggestion.title}</div>
                            <div className="text-sm ">{suggestion.description}
                            </div>
                            <div className="w-full flex ">
                                <Badge>
                                    {suggestion.difficulty}
                                </Badge>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}
