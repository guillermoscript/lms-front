import { google } from '@ai-sdk/google'
import { convertToCoreMessages, streamText } from 'ai'
import { z } from 'zod'

// Allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST (req: Request) {
    // 'data' contains the additional data that you have sent:

    try {
        const {
            messages
        } = await req.json()

        const result = await streamText({
            model: google('models/gemini-1.5-flash-latest'),
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
        console.error(error)
        return new Response('Error', { status: 500 })
    }
}
