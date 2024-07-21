'use server'
import 'server-only'

import { google } from '@ai-sdk/google'
import { generateId } from 'ai'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import dayjs from 'dayjs'
import { z } from 'zod'

import { SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import Message from '@/components/dashboards/Common/chat/Message'
import ChatLoadingSkeleton from '@/components/dashboards/student/chat/ChatLoadingSkeleton'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/server'

import { ClientMessage, Message as MessageType } from './ExamPreparationActions'

export async function continueTaskAiConversation (
    input: string
): Promise<ClientMessage> {
    const aiState = getMutableAIState<typeof TaskAiActions>()

    const supabase = createClient()

    console.log(input)

    // Update the AI state with the new user message.
    aiState.update({
        ...aiState.get(),
        messages: [
            ...aiState.get().messages,
            {
                id: generateId(),
                role: 'user',
                content: input
            }
        ]
    })

    const systemMessage = aiState.get().messages.find(
        (message) => message.role === 'system'
    )

    console.log(systemMessage)

    const result = await streamUI({
        model: google('models/gemini-1.5-pro-latest'),
        messages: [
            ...aiState.get().messages.map((message: any) => ({
                role: message.role,
                content: message.content,
                name: message.name
            }))
        ],
        temperature: 0.3,
        initial: (
            <Message
                sender={'assistant'}
                time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                isUser={false}
            >
                <ChatLoadingSkeleton />
            </Message>
        ),
        system: systemMessage.content,
        text: async function * ({ content, done }) {
            if (done) {
                aiState.done({
                    ...aiState.get(),
                    messages: [
                        ...aiState.get().messages,
                        {
                            id: generateId(),
                            role: 'assistant',
                            content
                        }
                    ]
                })

                yield <ChatLoadingSkeleton />

                const aiMessageInsert = await supabase.from('lessons_ai_task_messages').insert({
                    lesson_id: +aiState.get().lessonId,
                    message: content,
                    sender: 'assistant',
                    user_id: aiState.get().userId,
                    created_at: new Date().toISOString()
                })

                console.log(aiMessageInsert)
            }

            return (
                <Message
                    sender={'assistant'}
                    time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                    isUser={false}
                >
                    <ViewMarkdown markdown={content}/>
                </Message>
            )
        },
        tools: {
            makeUserAssigmentCompleted: {
                description:
                        'Function to mark the assignment as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the assignment.',
                parameters: z.object({
                    assignmentId: z.string().describe('The ID of the assignment to mark as completed.')
                }),
                generate: async function * ({
                    assignmentId
                }) {
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
                                            message: 'Assignment marked as completed.'
                                        }
                                    }
                                ]
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
                                            message: 'Assignment marked as completed.'
                                        }
                                    }
                                ]
                            }
                        ]
                    })

                    yield (
                        <Message
                            sender={'assistant'}
                            time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                            isUser={false}
                        >
                            <ChatLoadingSkeleton />
                        </Message>
                    )

                    const task = await supabase.from('lesson_completions').insert({
                        lesson_id: +aiState.get().lessonId,
                        user_id: aiState.get().userId
                    })

                    console.log(task)

                    return (
                        <Message
                            sender={'assistant'}
                            time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                            isUser={false}
                        >
                            <SuccessMessage
                                status="success"
                                message="Assignment marked as completed."
                            />
                        </Message>
                    )
                }
            },
        }
    })

    return {
        id: generateId(),
        role: 'assistant',
        display: result.value
    }
}

interface AIState {
    lessonId: string
    userId: string
    messages: MessageType[]
}

type UIState = Array<{
    id: string
    display: React.ReactNode
}>

export const TaskAiActions = createAI<AIState, UIState>({
    actions: {
        continueTaskAiConversation
    },
    initialUIState: [],
    initialAIState: {
        lessonId: '',
        userId: '',
        messages: [],
    }
})

export interface Chat extends Record<string, any> {
    id: string
    createdAt: Date
    messages: MessageType[]
}

export const getUIStateFromTaskAIState = (aiState: Chat) => {
    return aiState.messages
        .filter(message => message.role !== 'system')
        .map((message, index) => ({
            id: `${aiState.chatId}-${index}`,
            display:

          message.role === 'tool' ? (
              message.content.map(tool => {
                  return tool.toolName === 'makeUserAssigmentCompleted' ? (
                      <Message
                          sender={'assistant'}
                          time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                          isUser={false}
                      >
                          <SuccessMessage
                              status="success"
                              message="Assignment marked as completed."
                          />
                      </Message>
                  ) : null
              })
          ) : message.role === 'user' && typeof message.content === 'string' ? (
              <Message
                  sender={message.role}
                  time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                  isUser={true}
              >
                  <ViewMarkdown markdown={message.content} />
              </Message>
          ) : message.role === 'assistant' &&
            typeof message.content === 'string' ? (
                  <Message
                      sender={message.role}
                      time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                      isUser={false}
                  >
                      <ViewMarkdown markdown={message.content} />
                  </Message>
              ) : null
        }))
}
