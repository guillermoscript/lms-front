'use server'
import 'server-only'

import { google } from '@ai-sdk/google'
import { CoreMessage, generateId, generateObject } from 'ai'
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
            You are a teacher and you must give feedback and a grade to the student based on the exam he took
            You and the user can discuss the exam and the student's performance

            Messages inside [] means that it's a UI element or a user event. For example:
            - [showExamForm] means that the user will see an exam form and fill it out
            - [showExamResult] means that the user will see the result of the exam he took
            - [examsSuggestions] means that the user will see suggestions for exams he can take

            If the user requests a exam or quiz, call \`showExamForm\` to show the exam form. after an exan is taken, call \`showExamResult\` to show the result of the exam.
            As a teacher, if the user ask for an exam but is vague, you can suggest exams to the user by calling \`examsSuggestions\` or if the user is asking for suggestions.

            Besides that, you can also chat with users about possible topics for exams, or any other topic you want to discuss with the user that goes along with the exam preparation as this is a exam preparation chat.
        `,
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
                        label: z.string().describe('The question text for the user to answer')
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
                description: 'Show the user the result of the exam he took',
                parameters: z.object({
                    score: z.number().int().describe('The grade of the student in the exam with a scale from 0 to 20'),
                    overallFeedback: z.string().describe('The overall feedback for the student in the exam, if the student did well or not'),
                    questionAndAnswerFeedback: z.array(z.object({
                        question: z.string().describe('The original question'),
                        answer: z.string().describe('The answer the student gave'),
                        correctAnswer: z.string().describe('The correct answer of the question'),
                        feedback: z.string().describe('The feedback for the question the student gave')
                    }))
                }),
                generate: async function * ({
                    score,
                    overallFeedback,
                    questionAndAnswerFeedback
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
                                            questionAndAnswerFeedback
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
                                            questionAndAnswerFeedback
                                        }
                                    }
                                ]
                            }
                        ]
                    })

                    console.log(questionAndAnswerFeedback)

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
                                    toolName: 'showExamResult',
                                    toolCallId,
                                    result: {
                                        score,
                                        overallFeedback,
                                        questionAndAnswerFeedback
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
                                        questionAndAnswerFeedback
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
                            <ExamFeedbackCard
                                score={score}
                                overallFeedback={overallFeedback}
                                // @ts-expect-error
                                questionAndAnswerFeedback={questionAndAnswerFeedback}
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

export async function ExamPrepAnwser (data: Root) {
    const content = `The student anwsered the following questions: ${Object.values(data).map((item) => item.question).join(', ')}
                ${Object.values(data).map((item) => {
        if (Array.isArray(item.answers)) {
            console.log(item.answers)
            console.log(item.questionOptions)
            return 'Answer: ' + item.answers.join(', ') + ` Options: ${item.questionOptions.join(', ')}`
        } else {
            return `Answer: ${item.answer}`
        }
    }).join(', ')}`

    console.log(content)

    const { object } = await generateObject({
        model: google('models/gemini-1.5-pro-latest'),
        system: `You are a teacher and you must give feedback and a grade to the student based on the exam he took. The exam was about the following questions: ${Object.values(data).map((item) => item.question).join(', ')}`,
        messages: [
            {
                role: 'user',
                content
            }
        ],
        schema: z.object({
            grade: z.number().int().min(1).max(20).describe('The grade of the student in the exam with a scale from 1 to 20'),
            questionAndAnswerFeedback: z.array(z.object({
                question: z.string().describe('The question'),
                feedback: z.string().describe('The feedback for the question of the student')
            })).describe('The feedback for each question and answer the student gave in the exam'),
            overallFeedback: z.string().describe('The overall feedback for the student in the exam')
        })
    })

    return object
}

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
                              questionAndAnswerFeedback={tool.result.questionAndAnswerFeedback}
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
