import { google } from '@ai-sdk/google'
import { streamText } from 'ai'
import { z } from 'zod'

import { createClient } from '@/utils/supabase/server'

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

export async function POST(req: Request) {
    const body = await req.json()

    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error != null) {
        throw new Error(userData.error.message)
    }

    const result = streamText({
        model: google('gemini-2.0-pro-exp-02-05'),
        // model: openai('gpt-4o-mini-2024-07-18'),
        messages: body.messages,
        // experimental_transform: smoothStream(),
        temperature: 0.6,
        tools: {
            makeUserAssigmentCompleted: {
                description: 'Function to mark the exercise as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the exercise. Respond using the language of the student.',
                parameters: z.object({
                    feedback: z.string().describe('Feedback for the student. Tell them what they did right and what they can improve, if needed.'),
                }),
                execute: async ({ feedback }) => {
                    const save = await supabase.from('exercise_completions').insert(
                        {
                            exercise_id: body.exerciseId,
                            user_id: userData.data.user.id,
                            completed_by: userData.data.user.id,
                        }
                    )

                    return feedback
                }
            },
            provideHint: {
                description: 'Function to provide a helpful hint when the student is stuck on an exercise or he ask for help. The hint should guide them towards the solution without giving it away. Respond using the language of the student.',
                parameters: z.object({
                    hints: z.string().describe('Markdown formatted List of hints to provide to the student.'),
                }),
                execute: async ({ hints }) => {
                    return hints
                }
            }
        },
        async onFinish({ text, toolResults }) {
            const lastMessage = body.messages[body.messages.length - 1]

            const save = await supabase.from('exercise_messages').insert([
                {
                    exercise_id: body.exerciseId,
                    user_id: userData.data.user.id,
                    role: 'user',
                    message: lastMessage.content,
                }
            ])

            if (text && text.length > 0) {
                const saveText = await supabase.from('exercise_messages').insert(
                    {
                        exercise_id: body.exerciseId,
                        user_id: userData.data.user.id,
                        role: 'assistant',
                        message: text,
                    }
                )
            }

            if (toolResults[0].result) {
                const saveResult = await supabase.from('exercise_messages').insert(
                    {
                        exercise_id: body.exerciseId,
                        user_id: userData.data.user.id,
                        role: 'tool',
                        message: toolResults[0].result,
                    }
                )
            }
        }
    })

    return result.toDataStreamResponse()
}
