import { google } from '@ai-sdk/google'
import { generateId, streamText, tool } from 'ai'
import { z } from 'zod'

import { createClient } from '@/utils/supabase/server'
// Allow streaming responses up to 30 seconds
export const maxDuration = 60

export async function POST(req: Request) {
    const {
        messages,
        lessonId
    } = await req.json()

    const supabase = await createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error != null) {
        throw new Error(userData.error.message)
    }

    const result = streamText({
        model: google('gemini-2.0-flash-exp'),
        messages,
        onFinish: async (response) => {
            const lastUserMessage = messages[messages.length - 1]
            if (
                response.text !== ''
            ) {
                const save = await supabase.from('lessons_ai_task_messages').insert({
                    lesson_id: lessonId,
                    message: response.text,
                    sender: 'assistant',
                    user_id: userData.data.user.id,
                })

                if (save.error != null) {
                    throw new Error(save.error.message)
                }

                console.log('Message saved')
            }
        },
        tools: {
            makeUserAssignmentCompleted: tool({
                description:
                    'Function to mark the assignment as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the assignment. Respond using the language of the student.',
                parameters: z.object({
                    feedback: z.string().describe('Feedback for the student. Tell them what they did right and what they can improve, if needed.'),
                }),
                execute: async (params) => {
                    const toolCallId = generateId()

                    const saveMessage = await supabase.from('lessons_ai_task_messages').insert([
                        {
                            lesson_id: lessonId,
                            message: params.feedback,
                            sender: 'assistant',
                            user_id: userData.data.user.id,
                            created_at: new Date().toISOString(),
                        },
                    ])

                    if (saveMessage.error != null) {
                        throw new Error(saveMessage.error.message)
                    }

                    const saveTask = await supabase.from('lesson_completions').insert([
                        {
                            lesson_id: lessonId,
                            user_id: userData.data.user.id,
                        },
                    ])

                    if (saveTask.error != null) {
                        throw new Error(saveTask.error.message)
                    }

                    return params.feedback
                },
            }),
        }
    })

    return result.toDataStreamResponse()
}
