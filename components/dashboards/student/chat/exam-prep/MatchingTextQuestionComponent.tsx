'use client'

import { useState } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils'

export interface MatchingTextQuestion {
    id: string
    leftColumn: Array<{
        id: string
        text: string
    }>
    rightColumn: Array<{
        id: string
        text: string
        matchedWith: string
    }>
}

interface ColumnItem {
    id: string
    text: string
}

function MatchingTextQuestionComponent ({ question, isFinished, form }: { question: MatchingTextQuestion, isFinished: boolean, form: any }) {
    const [selectedLeft, setSelectedLeft] = useState<ColumnItem | null>(null)
    const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({})
    const [reverseMatchedPairs, setReverseMatchedPairs] = useState<Record<string, string>>({})

    const handleLeftClick = (leftItem: ColumnItem): void => {
        if (selectedLeft?.id === leftItem.id) {
            setSelectedLeft(null)
        } else {
            setSelectedLeft(leftItem)
        }
    }

    const handleRightClick = (rightItem: ColumnItem): void => {
        if (selectedLeft) {
            const newPairs = { ...matchedPairs, [selectedLeft.id]: rightItem.id }
            const newReversePairs = { ...reverseMatchedPairs, [rightItem.id]: selectedLeft.id }
            setMatchedPairs(newPairs)
            setReverseMatchedPairs(newReversePairs)
            setSelectedLeft(null)
            form.setValue(selectedLeft.id, rightItem.id)
        }
    }

    const handleDeselect = (leftId: string): void => {
        const rightId = matchedPairs[leftId]
        const newPairs = { ...matchedPairs }
        const newReversePairs = { ...reverseMatchedPairs }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete newPairs[leftId]
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete newReversePairs[rightId]
        setMatchedPairs(newPairs)
        setReverseMatchedPairs(newReversePairs)
        form.setValue(leftId, '')
    }

    const getBackgroundColor = (item: ColumnItem, column: 'left' | 'right'): string => {
        if (column === 'left' && selectedLeft && selectedLeft.id === item.id) {
            return buttonVariants({ variant: 'default' })
        }
        if (column === 'left' && matchedPairs[item.id]) {
            return buttonVariants({ variant: 'secondary' })
        }
        if (column === 'right' && reverseMatchedPairs[item.id]) {
            return buttonVariants({ variant: 'secondary' })
        }
        if (column === 'right' && selectedLeft && reverseMatchedPairs[item.id]) {
            return buttonVariants({ variant: 'default' })
        }
        return buttonVariants({ variant: 'outline' })
    }

    const isItemDisabled = (item: ColumnItem, column: 'left' | 'right'): boolean => {
        if (column === 'right' && reverseMatchedPairs[item.id]) {
            return true
        }
        if (column === 'left' && matchedPairs[item.id]) {
            return true
        }
        return false
    }

    const isMatched = (leftId: string, rightId: string): boolean => matchedPairs[leftId] === rightId

    return (
        <Card>
            <CardHeader>
                <CardTitle>Matching Text Question</CardTitle>
                <CardDescription>Match the items in the left column with the items in the right column by clicking on the items.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-8">
                    <div className="flex flex-col gap-4">
                        {question.leftColumn.map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    isItemDisabled(item, 'left') ? ' opacity-50 cursor-not-allowed' : 'cursor-pointer',
                                    getBackgroundColor(item, 'left'),
                                    'flex gap-4 items-center justify-between py-4 h-12'
                                )}
                                onClick={() => {
                                    if (isFinished) return
                                    !isItemDisabled(item, 'left') && handleLeftClick(item)
                                }}
                            >
                                <span>{item.text}</span>
                                {matchedPairs[item.id] && (
                                    <Button
                                        variant='destructive'
                                        onClick={() => handleDeselect(item.id)}
                                        disabled={isFinished}
                                    >
                    Cancel
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-4">
                        {question.rightColumn.map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    isItemDisabled(item, 'right') ? ' opacity-50 cursor-not-allowed' : 'cursor-pointer',
                                    getBackgroundColor(item, 'right'),
                                    'flex gap-4 items-center justify-between py-4 h-12'
                                )}
                                onClick={() => !isItemDisabled(item, 'right') && handleRightClick(item)}
                            >
                                <span>{item.text}</span>
                                {Object.keys(matchedPairs).map((leftId) => (
                                    isMatched(leftId, item.id) && (
                                        <span key={item.id} className="ml-2 text-lg">{' (Matched)'}</span>
                                    )
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter>

                {selectedLeft && (
                    <div className="text-center mt-4 text-gray-700">
                        <p>Selected: {selectedLeft.text}</p>
                    </div>
                )}
            </CardFooter>
        </Card>
    )
}

export default MatchingTextQuestionComponent

export interface FeedbackComponentProps {
    question: {
        question: string
        rightColumn: Array<{ id: string, text: string, matchedWith: string, userMatchedWith: string }>
        feedback: string
    }
}

export const FeedbackComponent: React.FC<FeedbackComponentProps> = ({ question }) => {
    const { rightColumn, feedback } = question

    const isMatchedCorrectly = (leftId: string, rightId: string): boolean => {
        const correctMatch = rightColumn.find(item => item.matchedWith === leftId)
        return correctMatch?.userMatchedWith === rightId
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Feedback</CardTitle>
                <CardDescription>Here is your feedback based on your answers.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4">
                    {rightColumn.map(item => (
                        <div key={item.id} className="flex gap-4 items-center justify-between py-4 h-12 border px-4 rounded-xl">
                            <span>{item.text}</span>
                            <span className={`ml-2 text-lg ${isMatchedCorrectly(item.matchedWith, item.userMatchedWith) ? 'text-green-500' : 'text-red-500'}`}>
                                {isMatchedCorrectly(item.matchedWith, item.userMatchedWith) ? 'Correct' : 'Incorrect'}
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter>
                <div className="text-center mt-4 ">
                    <p>{feedback}</p>
                </div>
            </CardFooter>
        </Card>
    )
}
