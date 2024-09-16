'use server'
import 'server-only'

import { openai } from '@ai-sdk/openai'
import { CoreMessage, generateId } from 'ai'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import dayjs from 'dayjs'
import { z } from 'zod'

import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import Message from '@/components/dashboards/Common/chat/Message'
import MessageContentWrapper from '@/components/dashboards/Common/chat/MessageContentWrapper'
import SubscribeNow from '@/components/home/SubscribeNow'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'

import { ClientMessage } from './ExamPreparationActions'

export async function continueShowCaseChatConversation(
    input: string,
    systemPrompt: string
): Promise<ClientMessage> {
    const aiState = getMutableAIState<typeof ShowCaseChatAI>()

    // Update the AI state with the new user message.
    aiState.update({
        messages: [
            ...aiState.get().messages,
            {
                id: generateId(),
                role: 'user',
                content: input,
            },
        ],
    })

    console.log(aiState.get())

    const result = await streamUI({
        model: openai('gpt-4o-mini'),
        messages: [
            ...aiState.get().messages.map((message: any) => ({
                role: message.role,
                content: message.content,
                name: message.name,
            })),
        ],
        temperature: 0.8,
        initial: (
            <Message
                sender={'assistant'}
                time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                isUser={false}
            >
                <ChatLoadingSkeleton />
            </Message>
        ),
        system: systemPrompt,
        text: async function ({ content, done }) {
            if (done) {
                aiState.done({
                    ...aiState.get(),
                    messages: [
                        ...aiState.get().messages,
                        {
                            id: generateId(),
                            role: 'assistant',
                            content,
                        },
                    ],
                })
            }

            return (
                <Message
                    sender={'assistant'}
                    time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                    isUser={false}
                >
                    <MessageContentWrapper
                        role="assistant"
                        view={<ViewMarkdown markdown={content} />}
                        edit={
                            <></>
                        }
                        regenerate={
                            <></>
                        }
                    />
                </Message>
            )
        },
        tools: {
            makeUserAssigmentCompleted: {
                description:
                    'Function to mark the assignment as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the assignment.',
                parameters: z.object({
                    assignmentId: z
                        .string()
                        .describe(
                            'The ID of the assignment to mark as completed.'
                        ),
                }),
                generate: async function ({ assignmentId }) {
                    const toolCallId = generateId()

                    aiState.done({
                        ...aiState.get(),
                        messages: [
                            ...aiState.get().messages,
                            {
                                id: generateId(),
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'tool-call',
                                        toolName: 'makeUserAssigmentCompleted',
                                        toolCallId,
                                        args: {
                                            status: 'success',
                                            message:
                                                'Assignment marked as completed.',
                                        },
                                    },
                                ],
                            },
                            {
                                id: generateId(),
                                role: 'tool',
                                content: [
                                    {
                                        type: 'tool-result',
                                        toolName: 'makeUserAssigmentCompleted',
                                        toolCallId,
                                        result: {
                                            status: 'success',
                                            message:
                                                'Assignment marked as completed.',
                                        },
                                    },
                                ],
                            },
                        ],
                    })

                    return (
                        <Message
                            sender={'assistant'}
                            time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                            isUser={false}
                        >
                            <div className="w-full flex flex-col gap-8">
                                <SuccessMessage
                                    status="success"
                                    message="Assignment marked as completed."
                                    fire={true}
                                />
                                <SubscribeNow />
                            </div>
                        </Message>
                    )
                },
            },
        },
    })

    return {
        id: generateId(),
        role: 'assistant',
        display: result.value,
    }
}

export type Message = CoreMessage & {
    id: string
}
export interface AIState {
    messages: Message[]
}

export type UIState = Array<{
    id: string
    role: 'user' | 'assistant' | 'tool'
    display: React.ReactNode
}>

export const ShowCaseChatAI = createAI<AIState, UIState>({
    actions: {
        continueShowCaseChatConversation
    },
    initialUIState: [],
    initialAIState: { messages: [] }
})
