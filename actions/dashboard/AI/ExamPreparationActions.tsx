'use server'
import 'server-only'

import { google } from '@ai-sdk/google'
import { CoreMessage, generateId } from 'ai'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import dayjs from 'dayjs'
import { ReactNode } from 'react'
import { z } from 'zod'

import Message from '@/components/dashboards/Common/chat/Message'
import ChatLoadingSkeleton from '@/components/dashboards/student/chat/ChatLoadingSkeleton'
import ExamFeedbackCard from '@/components/dashboards/student/chat/ExamFeedbackCard'
import ExamnSuggestions from '@/components/dashboards/student/chat/ExamnSuggestions'
import ExamPrepAiComponent from '@/components/dashboards/student/chat/ExamPrepAiComponent'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/server'

export interface ServerMessage {
    role: 'user' | 'assistant'
    content: string
}

export interface ClientMessage {
    id: string
    role: 'user' | 'assistant'
    display: ReactNode
}

export async function continueConversation (
    input: string
): Promise<ClientMessage> {
    const aiState = getMutableAIState<typeof AI>()

    const supabase = createClient()

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

    const result = await streamUI({
        model: google('models/gemini-1.5-pro-latest'),
        // model: openai('gpt-4o'),
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
        system: `\
            You are a PHD expert Teacher and you must give feedback and a grade to the student based on the exams he takes
            You and the user can discuss the exams and the student's performance.
            Generate questions for a student who wants to review the main concepts of the learning objectives in the exam.

            Messages inside [] means that it's a UI element or a user event. For example:
            - [showExamForm] means that the user will mean that the user will see a form to fill out for an exam preparation
            - [showExamResult] means that the user will see the result of the exam he took with the score and the feedback for each question
            - [examsSuggestions] means that the user will see suggestions for exams he can take, with the title, description, content, and difficulty of the exam, the user can click on the suggestion to see more details about the exam

Also you can chat the user and ask him questions about the subject to get more information about the subject and the learning objectives of the student.`,
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

                const aiMessageInsert = await supabase.from('messages').insert({
                    chat_id: +aiState.get().chatId,
                    message: content,
                    sender: 'assistant',
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
            showExamForm: {
                description: 'Show the user an exam form to fill out for an exam preparationn, this form will be sent to the user and he will anwser it',
                parameters: z.object({
                    singleSelectQuestion: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        text: z.string().describe('The label of the question'),
                        options: z.array(
                            z.object({
                                id: z.string().describe('The id of the option'),
                                text: z.string().describe('The text of the option, could be true or false')
                            })
                        ).describe('The options of the question, could be true or false')
                    })),
                    multipleChoiceQuestion: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        label: z.string().describe('The label of the question'),
                        options: z.array(
                            z.object({
                                id: z.string().describe('The id of the option'),
                                text: z.string().describe('The text of the option')
                            })
                        )
                    }).refine((value) => value.id !== undefined, {
                        message: 'Each multiple choice question must have an id.'
                    })),
                    freeTextQuestion: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        label: z.string().describe('The question the user must anwser with a free text')
                    })),
                    matchingTextQuestions: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        leftColumn: z.array(z.object({
                            id: z.string().describe('The id of the left column item'),
                            text: z.string().describe('The text in the left column')
                        })),
                        rightColumn: z.array(z.object({
                            id: z.string().describe('The id of the right column item'),
                            text: z.string().describe('The text in the right column'),
                            matchedWith: z.string().describe('The id of the matching left column item')
                        }))
                    }).refine((value) => value.id !== undefined, {
                        message: 'Each matching text question must have an id.'
                    }))
                }),
                generate: async function * ({
                    singleSelectQuestion,
                    multipleChoiceQuestion,
                    freeTextQuestion,
                    matchingTextQuestions
                }) {
                    const toolCallId = generateId()

                    console.log(matchingTextQuestions)

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
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        args: {
                                            singleSelectQuestion,
                                            multipleChoiceQuestion,
                                            freeTextQuestion,
                                            matchingTextQuestions
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
                                        toolName: 'showExamForm',
                                        toolCallId,
                                        result: {
                                            singleSelectQuestion,
                                            multipleChoiceQuestion,
                                            freeTextQuestion,
                                            matchingTextQuestions
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

                    const aiMessageInsert = await supabase.from('messages').insert([
                        {
                            chat_id: +aiState.get().chatId,
                            message: JSON.stringify([
                                {
                                    type: 'tool-call',
                                    toolName: 'showExamForm',
                                    toolCallId,
                                    result: {
                                        singleSelectQuestion,
                                        multipleChoiceQuestion,
                                        freeTextQuestion,
                                        matchingTextQuestions
                                    }
                                }
                            ]),
                            sender: 'assistant',
                            created_at: new Date().toISOString()
                        },
                        {
                            chat_id: +aiState.get().chatId,
                            message: JSON.stringify([
                                {
                                    type: 'tool-result',
                                    toolName: 'showExamForm',
                                    toolCallId,
                                    result: {
                                        singleSelectQuestion,
                                        multipleChoiceQuestion,
                                        freeTextQuestion,
                                        matchingTextQuestions
                                    }
                                }
                            ]),
                            sender: 'tool',
                            created_at: new Date().toISOString()
                        }

                    ])

                    return (
                        <Message
                            sender={'assistant'}
                            time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                            isUser={false}
                        >
                            <ExamPrepAiComponent
                            // @ts-expect-error
                                singleSelectQuestions={singleSelectQuestion}
                                // @ts-expect-error
                                multipleChoiceQuestions={multipleChoiceQuestion}
                                // @ts-expect-error
                                freeTextQuestions={freeTextQuestion}
                                // @ts-expect-error
                                matchingTextQuestions={matchingTextQuestions}
                            />
                        </Message>
                    )
                }
            },
            showExamResult: {
                description: 'Show the user the result of the exam he took with the score and the feedback for each question',
                parameters: z.object({
                    score: z.number().int().describe('The grade of the student in the exam with a scale from 0 to 20'),
                    overallFeedback: z.string().describe('The overall feedback for the student in the exam, if the student did well or not'),
                    freeTextQuestionFeedback: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        question: z.string().describe('The original question'),
                        answer: z.string().describe('The answer the student gave'),
                        correctAnswer: z.string().describe('The correct answer of the question'),
                        feedback: z.string().describe('The feedback for the question the student gave')
                    })),
                    multipleChoiceQuestionFeedback: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        question: z.string().describe('The original question'),
                        options: z.array(z.object({
                            id: z.string().describe('The id of the option'),
                            text: z.string().describe('The text of the option'),
                            correct: z.boolean().describe('If the option is correct or not'),
                            userSelected: z.boolean().describe('If the user selected the option')
                        }))
                    })),
                    singleSelectQuestionFeedback: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        question: z.string().describe('The original question'),
                        answer: z.string().describe('The answer the student gave'),
                        correctAnswer: z.string().describe('The correct answer of the question'),
                        feedback: z.string().describe('The feedback for the question the student gave')
                    })),
                    matchingTextQuestionsFeedback: z.array(z.object({
                        question: z.string().describe('The original question'),
                        rightColumn: z.array(z.object({
                            id: z.string().describe('The id of the right column item'),
                            text: z.string().describe('The text in the right column'),
                            matchedWith: z.string().describe('The id of the matching left column item'),
                            userMatchedWith: z.string().describe('The id of the matching left column item')
                        })),
                        feedback: z.string().describe('The feedback for the question the student gave')
                    }))

                }),
                generate: async function * ({
                    score,
                    overallFeedback,
                    freeTextQuestionFeedback,
                    multipleChoiceQuestionFeedback,
                    singleSelectQuestionFeedback,
                    matchingTextQuestionsFeedback
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
                                        toolName: 'showExamResult',
                                        toolCallId,
                                        args: {
                                            score,
                                            overallFeedback,
                                            freeTextQuestionFeedback,
                                            multipleChoiceQuestionFeedback,
                                            singleSelectQuestionFeedback,
                                            matchingTextQuestionsFeedback
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
                                        toolName: 'showExamResult',
                                        toolCallId,
                                        result: {
                                            score,
                                            overallFeedback,
                                            freeTextQuestionFeedback,
                                            multipleChoiceQuestionFeedback,
                                            singleSelectQuestionFeedback,
                                            matchingTextQuestionsFeedback
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

                    const aiMessageInsert = await supabase
                        .from('messages')
                        .insert([
                            {
                                chat_id: +aiState.get().chatId,
                                message: JSON.stringify([
                                    {
                                        type: 'tool-call',
                                        toolName: 'showExamResult',
                                        toolCallId,
                                        result: {
                                            score,
                                            overallFeedback,
                                            freeTextQuestionFeedback,
                                            multipleChoiceQuestionFeedback,
                                            singleSelectQuestionFeedback,
                                            matchingTextQuestionsFeedback
                                        }
                                    }
                                ]),
                                sender: 'assistant',
                                created_at: new Date().toISOString()
                            },
                            {
                                chat_id: +aiState.get().chatId,
                                message: JSON.stringify([
                                    {
                                        type: 'tool-result',
                                        toolName: 'showExamResult',
                                        toolCallId,
                                        result: {
                                            score,
                                            overallFeedback,
                                            freeTextQuestionFeedback,
                                            multipleChoiceQuestionFeedback,
                                            singleSelectQuestionFeedback,
                                            matchingTextQuestionsFeedback
                                        }
                                    }
                                ]),
                                sender: 'tool',
                                created_at: new Date().toISOString()
                            }
                        ])
                    console.log(freeTextQuestionFeedback,
                        multipleChoiceQuestionFeedback,
                        singleSelectQuestionFeedback,
                        matchingTextQuestionsFeedback)

                    return (
                        <Message
                            sender={'assistant'}
                            time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                            isUser={false}
                        >
                            <ExamFeedbackCard
                                score={score}
                                overallFeedback={overallFeedback}
                                // @ts-expect-error
                                freeTextQuestionFeedback={freeTextQuestionFeedback}
                                // @ts-expect-error
                                multipleChoiceQuestionFeedback={multipleChoiceQuestionFeedback}
                                // @ts-expect-error
                                singleSelectQuestionFeedback={singleSelectQuestionFeedback}
                                // @ts-expect-error
                                matchingTextQuestionsFeedback={matchingTextQuestionsFeedback}
                                fire

                            />
                        </Message>
                    )
                }
            },
            examsSuggestions: {
                description: 'Show the user suggestions for exams forms he can take',
                parameters: z.object({
                    suggestions: z.array(z.object({
                        title: z.string().describe('The title of the suggestion for the exam'),
                        description: z.string().describe('The description of the suggestion for the exam'),
                        content: z.string().describe('The content of the suggestion for the exam'),
                        difficulty: z.string().describe('The difficulty of the exam')
                    }))
                }),
                generate: async function * ({
                    suggestions
                }) {
                    const toolCallId = generateId()

                    console.log(suggestions)

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
                                        toolName: 'examsSuggestions',
                                        toolCallId,
                                        args: {
                                            suggestions
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
                                        toolName: 'examsSuggestions',
                                        toolCallId,
                                        result: {
                                            suggestions
                                        }
                                    }
                                ]
                            }
                        ]
                    })

                    yield <ChatLoadingSkeleton />

                    const aiMessageInsert = await supabase.from('messages').insert([
                        {
                            chat_id: +aiState.get().chatId,
                            message: JSON.stringify([
                                {
                                    type: 'tool-call',
                                    toolName: 'examsSuggestions',
                                    toolCallId,
                                    result: {
                                        suggestions
                                    }
                                }
                            ]),
                            sender: 'assistant',
                            created_at: new Date().toISOString()
                        },
                        {
                            chat_id: +aiState.get().chatId,
                            message: JSON.stringify([
                                {
                                    type: 'tool-result',
                                    toolName: 'examsSuggestions',
                                    toolCallId,
                                    result: {
                                        suggestions
                                    }
                                }
                            ]),
                            sender: 'tool',
                            created_at: new Date().toISOString()
                        }
                    ])

                    console.log(suggestions)

                    return (
                        <Message
                            sender={'assistant'}
                            time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                            isUser={false}
                        >
                            <ExamnSuggestions
                                // @ts-expect-error
                                suggestions={suggestions}
                            />
                        </Message>
                    )
                }
            }
        }
    })

    return {
        id: generateId(),
        role: 'assistant',
        display: result.value
    }
}

export type Message = CoreMessage & {
    id: string
}
export interface AIState {
    chatId: string
    messages: Message[]
}

export type UIState = Array<{
    id: string
    display: React.ReactNode
}>

export const AI = createAI<AIState, UIState>({
    actions: {
        continueConversation
    },
    initialUIState: [],
    initialAIState: { chatId: generateId(), messages: [] }
})

type Root = Record<string | number, {
    question: string
    answer: string
    questionOptions?: string[]
    answers?: string[]
}>

export interface Chat extends Record<string, any> {
    id: string
    createdAt: Date
    messages: Message[]
}

export const getUIStateFromAIState = (aiState: Chat) => {
    return aiState.messages
        .filter(message => message.role !== 'system')
        .map((message, index) => ({
            id: `${aiState.chatId}-${index}`,
            display:

          message.role === 'tool' ? (
              message.content.map(tool => {
                  // find if the next message is a showExamResult
                  // @ts-expect-error
                  const isNextMessageAShowExamnResult = aiState?.messages[index + 1] ? aiState?.messages[index + 1].content[0]?.toolName === 'showExamResult' : false
                  return tool.toolName === 'showExamForm' ? (
                      <Message
                          sender={'assistant'}
                          time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                          isUser={false}
                      >
                          <ExamPrepAiComponent
                              // @ts-expect-error
                              singleSelectQuestions={tool.result.singleSelectQuestion}
                              // @ts-expect-error
                              multipleChoiceQuestions={tool.result.multipleChoiceQuestion}
                              // @ts-expect-error
                              freeTextQuestions={tool.result.freeTextQuestion}
                              // @ts-expect-error
                              matchingTextQuestions={tool.result.matchingTextQuestions}
                              hideSubmit={isNextMessageAShowExamnResult}
                          />
                      </Message>
                  ) : tool.toolName === 'showExamResult' ? (
                      <Message
                          sender={'assistant'}
                          time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                          isUser={false}
                      >
                          <ExamFeedbackCard
                              // @ts-expect-error
                              score={tool.result.score}
                              // @ts-expect-error
                              overallFeedback={tool.result.overallFeedback}
                              // @ts-expect-error
                              freeTextQuestionFeedback={tool.result.freeTextQuestionFeedback}
                              // @ts-expect-error
                              multipleChoiceQuestionFeedback={tool.result.multipleChoiceQuestionFeedback}
                              // @ts-expect-error
                              singleSelectQuestionFeedback={tool.result.singleSelectQuestionFeedback}
                              // @ts-expect-error
                              matchingTextQuestionsFeedback={tool.result.matchingTextQuestionsFeedback}
                          />
                      </Message>
                  ) : tool.toolName === 'examsSuggestions' ? (
                      <Message
                          sender={'assistant'}
                          time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                          isUser={false}
                      >
                          <ExamnSuggestions
                              // @ts-expect-error
                              suggestions={tool.result.suggestions}
                              //   onSuggestionClick={(title) => console.log(title)}
                              disabled={true}
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
