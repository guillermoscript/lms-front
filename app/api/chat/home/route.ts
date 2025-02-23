import { google } from '@ai-sdk/google'
import { streamText } from 'ai'
import { z } from 'zod'

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

export async function POST(req: Request) {
    const { messages } = await req.json()

    const result = streamText({
        model: google('gemini-2.0-pro-exp-02-05'),
        messages,
        maxSteps: 3,
        toolCallStreaming: true,
        tools: {
            makeUserAssignmentCompleted: {
                description: 'Funcion para marcar la tarea como completada. Responde usando el lenguaje del estudiante.',
                parameters: z.object({
                    feedback: z.string().describe('Retroalimentacion para el estudiante. Dile lo que hizo bien y en que puede mejorar, si es necesario.'),
                }),
                execute: async ({ feedback }) => {
                    return 
                }
            },
            provideHint: {
                description: 'Function to provide a helpful hint when the student is stuck on an assignment or he ask for help. The hint should guide them towards the solution without giving it away. Respond using the language of the student.',
                parameters: z.object({
                    hints: z.string().describe('Markdown formatted List of hints to provide to the student.'),
                }),
                execute: async ({ hints }) => {
                    return hints
                }
            }
        }
    })

    console.log(result)

    return result.toDataStreamResponse()
}
