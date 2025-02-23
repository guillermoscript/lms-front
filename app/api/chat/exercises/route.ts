import { google } from '@ai-sdk/google'
import { convertToCoreMessages, streamText } from 'ai'
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
        messages: convertToCoreMessages(body.messages),
        temperature: 0.5,
        tools: {
            makeUserAssigmentCompleted: {
                description: 'Function to mark the exercise as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the exercise. Respond using the language of the student.',
                parameters: z.object({
                    feedback: z.string().describe('Feedback for the student. Tell them what they did right and what they can improve, if needed.'),
                }),
                execute: async ({ feedback }) => {
                    // await supabase.from('exercise_completions').insert({
                    //     user_id: userData.data.user.id,
                    //     exercise_id: +body.exerciseId,
                    //     completed_by: userData.data.user.id,
                    // })

                    console.log(feedback)
                    return feedback
                }
            }
        }
    })

    return result.toDataStreamResponse()
}
