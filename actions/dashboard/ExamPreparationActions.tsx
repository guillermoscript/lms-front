'use server'
import { google } from '@ai-sdk/google'
import { generateId, generateObject } from 'ai'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import { ReactNode } from 'react'
import { z } from 'zod'

import ExamPrepAiComponent from '@/components/dashboards/student/chat/ExamPrepAiComponent'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'

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
    'use server'

    const history = getMutableAIState()

    const result = await streamUI({
        model: google('models/gemini-1.5-pro-latest'),
        // model: openai('gpt-4o'),
        messages: [...history.get(), { role: 'user', content: input }],
        temperature: 0,

        text: ({ content, done }) => {
            if (done) {
                history.done((messages: ServerMessage[]) => [
                    ...messages,
                    { role: 'assistant', content }
                ])
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
                        text: z.string().describe('The question to ask the user')
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
                    })),
                    freeTextQuestion: z.array(z.object({
                        id: z.string().describe('The id of the question'),
                        label: z.string().describe('The question text for the user to answer'),
                        placeholder: z.string().describe('The place holder of the question')
                    }))
                }),
                generate: async ({
                    singleSelectQuestion,
                    multipleChoiceQuestion,
                    freeTextQuestion
                }) => {
                    console.log(singleSelectQuestion)

                    console.log(multipleChoiceQuestion)

                    console.log(freeTextQuestion)

                    history.done((messages: ServerMessage[]) => [
                        ...messages,
                        {
                            role: 'assistant',
                            content: 'Showing the form to the user'
                        }
                    ])

                    return (
                        <ExamPrepAiComponent
                            singleSelectQuestions={singleSelectQuestion}
                            multipleChoiceQuestions={multipleChoiceQuestion}
                            freeTextQuestions={freeTextQuestion}
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

export const AI = createAI<ServerMessage[], ClientMessage[]>({
    actions: {
        continueConversation
    },
    // onGetUIState (...args) {
    //     console.log('onGetUIState', args)
    // },
    // onSetAIState ({ key, state, done }) {
    //     console.log('onSetAIState', key, state, done)
    // },

    initialAIState: [],
    initialUIState: []
})

type Root = Record<string | number, {
    question: string
    answer: string | string[]
}>

export async function ExamPrepAnwser (data: Root) {
    console.log(data)

    // const { text } = await generateText({
    //     model: google('models/gemini-1.5-pro-latest'),
    //     system: `You are a teacher and you must give feedback and a grade to the student based on the exam he took. The exam was about the following questions: ${Object.values(data).map((item) => item.question).join(', ')}`,
    //     messages: [
    //         {
    //             role: 'user',
    //             content: `The student anwsered the following questions: ${Object.values(data).map((item) => item.question).join(', ')}
    //             ${Object.values(data).map((item) => {
    //     if (Array.isArray(item.answer)) {
    //         return item.answer.map((answer) => `Answer: ${answer}`).join(', ')
    //     } else {
    //         return `Answer: ${item.answer}`
    //     }
    // }).join(', ')}
    //             `
    //         }
    //     ]
    // })

    // console.log(text)

    const { object } = await generateObject({
        model: google('models/gemini-1.5-pro-latest'),
        system: `You are a teacher and you must give feedback and a grade to the student based on the exam he took. The exam was about the following questions: ${Object.values(data).map((item) => item.question).join(', ')}`,
        messages: [
            {
                role: 'user',
                content: `The student anwsered the following questions: ${Object.values(data).map((item) => item.question).join(', ')}
                ${Object.values(data).map((item) => {
        if (Array.isArray(item.answer)) {
            return item.answer.map((answer) => `Answer: ${answer}`).join(', ')
        } else {
            return `Answer: ${item.answer}`
        }
    }).join(', ')}
                `
            }
        ],
        schema: z.object({
            grade: z.number().int().min(1).max(20).describe('The grade of the student in the exam with a scale from 1 to 20'),
            questionAndAnswerFeedback: z.array(z.object({
                question: z.string().describe('The question'),
                feedback: z.string().describe('The feedback for the question of the student')
            })).describe('The feedback for each question and answer the student gave in the exam')
        })
    })

    return object
}
