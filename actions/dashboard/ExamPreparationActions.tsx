'use server'
import 'server-only'

import { google } from '@ai-sdk/google'
import { CoreMessage, generateId, generateObject } from 'ai'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import { Facebook, Loader } from 'lucide-react'
import { ReactNode } from 'react'
import { z } from 'zod'

import Message from '@/components/dashboards/Common/chat/Message'
import ExamFeedbackCard from '@/components/dashboards/student/chat/ExamFeedbackCard'
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

    console.log(aiState.get())
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
        initial: (<div className="group relative flex items-start md:-ml-12">
            <div className="flex size-[24px] shrink-0 select-none items-center justify-center rounded-md border bg-primary text-primary-foreground shadow-sm">
                <Facebook className="w-6 h-6" />
            </div>
            <div className="ml-4 h-[24px] flex flex-row items-center flex-1 space-y-2 overflow-hidden px-1">
                <Loader className="w-4 h-4 text-primary animate-spin" />
            </div>
        </div>),
        system: `\
            You are a teacher and you must give feedback and a grade to the student based on the exam he took
            You and the user can discuss the exam and the student's performance

            Messages inside [] means that it's a UI element or a user event. For example:
            - [showExamnForm] means that the user will see an exam form and fill it out
            - [showExamnResult] means that the user will see the result of the exam he took

            If the user requests a exam, call \`showExamnForm\` to show the exam form.

            Besides that, you can also chat with users
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
                console.log(aiState.get())

                yield <div>Loading...</div> // [!code highlight:5]

                const aiMessageInsert = await supabase.from('messages').insert({
                    chat_id: +aiState.get().chatId,
                    message: content,
                    sender: 'assistant',
                    created_at: new Date().toISOString()
                })

                console.log(aiMessageInsert)
            }

            console.log(content)

            return (
                <ViewMarkdown markdown={content}/>
            )
        },
        tools: {
            showExamnForm: {
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
                        label: z.string().describe('The question text for the user to answer'),
                        placeholder: z.string().describe('The place holder of the question')
                    }))
                }),
                generate: async function * ({
                    singleSelectQuestion,
                    multipleChoiceQuestion,
                    freeTextQuestion
                }) {
                    const toolCallId = generateId()

                    console.log(aiState.get())

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
                                        toolName: 'showExamnForm',
                                        toolCallId,
                                        args: {
                                            singleSelectQuestion,
                                            multipleChoiceQuestion,
                                            freeTextQuestion
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
                                        toolName: 'showExamnForm',
                                        toolCallId,
                                        result: {
                                            singleSelectQuestion,
                                            multipleChoiceQuestion,
                                            freeTextQuestion
                                        }
                                    }
                                ]
                            }
                        ]
                    })

                    yield <div>Loading...</div>

                    const aiMessageInsert = await supabase.from('messages').insert(
                        {
                            chat_id: +aiState.get().chatId,
                            message: JSON.stringify(
                                {
                                    type: 'tool-result',
                                    toolName: 'showExamnForm',
                                    toolCallId,
                                    result: {
                                        singleSelectQuestion,
                                        multipleChoiceQuestion,
                                        freeTextQuestion
                                    }
                                }
                            ),
                            sender: 'tool',
                            created_at: new Date().toISOString()
                        }
                    )

                    console.log(aiMessageInsert)

                    console.log(aiState.get())

                    return (
                        <ExamPrepAiComponent
                            singleSelectQuestions={singleSelectQuestion}
                            multipleChoiceQuestions={multipleChoiceQuestion}
                            freeTextQuestions={freeTextQuestion}
                        />
                    )
                }
            },
            showExamnResult: {
                description: 'Show the user the result of the exam he took',
                parameters: z.object({
                    score: z.number().int().min(1).max(20).describe('The grade of the student in the exam with a scale from 1 to 20'),
                    overallFeedback: z.string().describe('The overall feedback for the student in the exam, if the student did well or not'),
                    questionAndAnswerFeedback: z.array(z.object({
                        question: z.string().describe('The question'),
                        answer: z.string().describe('The answer the student gave'),
                        correctAnswer: z.string().describe('The correct answer of the question'),
                        feedback: z.string().describe('The feedback for the question and answer the student gave in the exam')
                    }))
                }),
                generate: async function * ({
                    score,
                    overallFeedback,
                    questionAndAnswerFeedback
                }) {
                    const toolCallId = generateId()

                    console.log(aiState.get())

                    console.log(input)

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
                                        toolName: 'showExamnResult',
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
                                        toolName: 'showExamnResult',
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

                    yield <div>Loading...</div>

                    const aiMessageInsert = await supabase.from('messages').insert(
                        {
                            chat_id: +aiState.get().chatId,
                            message: JSON.stringify(
                                {
                                    type: 'tool-result',
                                    toolName: 'showExamnResult',
                                    toolCallId,
                                    result: {
                                        score,
                                        overallFeedback,
                                        questionAndAnswerFeedback
                                    }
                                }
                            ),
                            sender: 'tool',
                            created_at: new Date().toISOString()
                        }
                    )

                    console.log(aiMessageInsert)

                    console.log(aiState.get())

                    return (
                        <ExamFeedbackCard
                            score={score}
                            overallFeedback={overallFeedback}
                            questionAndAnswerFeedback={questionAndAnswerFeedback}
                        />
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
    // onGetUIState: async () => {
    //     'use server'

    //     const supabase = createClient()
    //     const userData = await supabase.auth.getUser()

    //     if (userData.error) {
    //         return
    //     }

    //     const aiState = getAIState()
    //     console.log(aiState)

    //     const messagesData = await supabase
    //         .from('chats')
    //         .select('*, messages(*)')
    //         .eq('chat_id', Number(aiState.chatId))
    //         .order('created_at', { ascending: true })
    //         .single()

    //     if (messagesData.error) {
    //         console.log(messagesData.error)
    //         throw new Error('Error fetching messages')
    //     }

    //     console.log(messagesData.data.messages.length)

    //     console.log(aiState.messages.length)

    //     if (messagesData.data.messages.length === aiState.messages.length) {
    //         return
    //     }

    //     if (aiState) {
    //         console.log(aiState)
    //         const uiState = await getUIStateFromAIState(aiState)

    //         console.log(uiState)
    //         return uiState
    //     }
    // },
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
const renderFunctions = {
    tool: (tool) => {
        switch (tool.toolName) {
            case 'showExamnForm':
                return (
                    <Message
                        sender={'assistant'}
                        time={new Date().toDateString()}
                        isUser={false}
                    >
                        <ExamPrepAiComponent
                            singleSelectQuestions={tool.result.singleSelectQuestion}
                            multipleChoiceQuestions={tool.result.multipleChoiceQuestion}
                            freeTextQuestions={tool.result.freeTextQuestion}
                        />
                    </Message>
                )
            case 'showExamnResult':
                return (
                    <Message
                        sender={'assistant'}
                        time={new Date().toDateString()}
                        isUser={false}
                    >
                        <ExamFeedbackCard
                            score={tool.result.score}
                            overallFeedback={tool.result.overallFeedback}
                            questionAndAnswerFeedback={tool.result.questionAndAnswerFeedback}
                        />
                    </Message>
                )
            default:
                return null
        }
    },
    user: (message) => {
        return (
            <Message
                sender={message.role}
                time={new Date().toDateString()}
                isUser={message.role === 'user'}
            >
                <ViewMarkdown markdown={message.content} />
            </Message>
        )
    },
    assistant: (message) => {
        console.log(message)
        return (
            typeof message.content === 'string' ? (
                <Message
                    sender={message.role}
                    time={new Date().toDateString()}
                    isUser={message.role === 'user'}
                >
                    <ViewMarkdown markdown={message.content} />
                </Message>
            ) : null
        )
    }
}
export const getUIStateFromAIState = (aiState) => {
    let mesg
    if (Array.isArray(aiState)) {
        mesg = aiState
    } else {
        mesg = aiState.messages
    }
    const val = mesg
        .filter((message) => message.role !== 'system')
        .map(message => {
            const renderFunction = renderFunctions[message.role]

            if (message.role === 'tool') {
                if (Array.isArray(message.content)) {
                    return message.content.map(renderFunction)
                } else {
                    const parsedContent = JSON.parse(message.content)
                    console.log(parsedContent)
                    return renderFunctions[message.role](parsedContent)
                }
            }
            return renderFunction(message)
        })
    return val
}
