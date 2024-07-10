import { google } from '@ai-sdk/google'
import { convertToCoreMessages, streamText } from 'ai'
import { z } from 'zod'

import { createClient } from '@/utils/supabase/server'

// Allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST (req: Request) {
    // 'data' contains the additional data that you have sent:

    try {
        const {
            messages, lessonId
        } = await req.json()
        const supabase = createClient()

        const result = await streamText({
            model: google('models/gemini-1.5-pro-latest'),
            onFinish: async (event) => {
                const userData = await supabase.auth.getUser()
                if (userData.error) {
                    console.log('Error getting user data', userData.error)
                } else {
                    const id = userData.data.user.id
                    // add message to the database
                    const message = await supabase.from('lessons_ai_task_messages').insert(
                        {
                            user_id: id,
                            message: event.text,
                            sender: 'assistant', // 'student' or 'assistant
                            lesson_id: lessonId
                        })
                }
            },
            temperature: 0.5,
            // model: ollama('llama3'),
            messages: convertToCoreMessages(messages),
            tools: {
                // server-side tool with execute function:
                makeUserAssigmentCompleted: {
                    description:
                        'Function to mark the assignment as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the assignment.',
                    parameters: z.object({
                        assignmentId: z.string().describe('The ID of the assignment to mark as completed.')
                    }),
                    execute: async function ({ assignmentId }) {
                        // Mark the assignment as completed
                        const userData = await supabase.auth.getUser()
                        if (userData.error) {
                            console.log('Error getting user data', userData.error)
                        } else {
                            const task = await supabase.from('lesson_completions').insert({
                                lesson_id: lessonId,
                                user_id: userData.data.user.id
                            })

                            if (task.error) {
                                return {
                                    status: 'error',
                                    message: 'Error marking the assignment as completed.'
                                }
                            }
                        }

                        return {
                            status: 'success',
                            message: 'Assignment marked as completed.'
                        }
                    }
                }
            }
        })

        // Respond with the stream
        return result.toAIStreamResponse()
    } catch (error) {
        console.log('Error:', error)
        return new Response('Error', { status: 500 })
    }
}
