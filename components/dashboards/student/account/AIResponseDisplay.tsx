'use client'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { AIKnowMeResponseData, KnowMeChatAI } from '@/actions/dashboard/AI/KnowMeActions'
import { Button } from '@/components/ui/button'

interface AIResponseDisplayProps {
    data: AIKnowMeResponseData;
    hideSubmit?: boolean;
}

export default function AIResponseDisplay({ data, hideSubmit }: AIResponseDisplayProps) {
    const { continueKnowMeChatConversation } = useActions()
    const [_, setMessages] = useUIState<typeof KnowMeChatAI>()
    const [isFinished, setIsFinished] = useState<boolean>(hideSubmit || false)
    const [loading, setLoading] = useState<boolean>(false)

    async function NewForm() {
        setLoading(true)
        try {
            const content = 'The student has completed the learning preferences form. but he wants to continue the conversation and wants anther for to get more insights about his learning preferences. [askForUserInput] please call the function `askForUserInput` to get the form.'

            const { display } = await continueKnowMeChatConversation(content)

            setMessages((messages) => {
                console.log('messages', messages)
                return [...messages, {
                    id: generateId(),
                    display
                }]
            })
            setIsFinished(true)
            console.log(data)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-6 rounded-lg shadow-md space-y-6">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Learning Overview</h2>
                <p>{data.learningOverview}</p>
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Learning Strategies</h2>
                <ul className="list-disc list-inside">
                    {data.learningStrategies.map((item, index) => (
                        <li key={index}>
                            <strong>{item.strategy}:</strong> {item.description}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Psychological Profile</h2>
                <div className="space-y-2">
                    <h3 className="text-lg font-medium">Traits</h3>
                    <ul className="list-disc list-inside">
                        {data.psychologicalProfile.traits.map((trait, index) => (
                            <li key={index}>
                                <strong>{trait.trait}:</strong> {trait.level}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="space-y-2">
                    <h3 className="text-lg font-medium">Motivation Factors</h3>
                    <ul className="list-disc list-inside">
                        {data.psychologicalProfile.motivationFactors.map((factor, index) => (
                            <li key={index}>{factor}</li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h3 className="text-lg font-medium">Preferred Learning Style</h3>
                    <p>{data.psychologicalProfile.preferredLearningStyle}</p>
                </div>
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Learning Environment</h2>
                <p><strong>Structure Preference:</strong> {data.learningEnvironment.structurePreference}</p>
                <p><strong>Group Preference:</strong> {data.learningEnvironment.groupPreference}</p>
                <p><strong>Ideal Study Time:</strong> {data.learningEnvironment.idealStudyTime}</p>
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Potential Challenges</h2>
                <ul className="list-disc list-inside">
                    {data.potentialChallenges.map((challenge, index) => (
                        <li key={index}>
                            <strong>{challenge.challenge}:</strong> {challenge.mitigationStrategy}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Additional Insights</h2>
                <ul className="list-disc list-inside">
                    {data.additionalInsights.map((insight, index) => (
                        <li key={index}>{insight}</li>
                    ))}
                </ul>
            </div>
            <Button
                onClick={NewForm}
                disabled={isFinished || loading}
            >
                {loading ? 'Loading...' : isFinished ? 'Form Completed' : 'Continue Conversation'}
            </Button>
        </div>
    )
}
