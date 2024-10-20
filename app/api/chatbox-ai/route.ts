import { createAISDKTools } from '@agentic/ai-sdk'
import { TavilyClient } from '@agentic/tavily'
import { google } from '@ai-sdk/google'
import { convertToCoreMessages, Message, streamText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
interface RequestBody {
    messages: Message[];
}

export async function POST(request: NextRequest) {
    try {
        const reqBody: RequestBody = await request.json()
        const tavilSearch = new TavilyClient()
        const model = google('gemini-1.5-pro-latest')

        const result = await streamText({
            model,
            messages: convertToCoreMessages(reqBody.messages),
            temperature: 0.7,
            tools: {
                ...createAISDKTools(tavilSearch),
                foolowUpQuestions: {
                    description: 'Function to provide a helpful set of follow-up questions to ask the teacher about the topic. Respond using the language of the student.',
                    parameters: z.object({
                        questions: z.array(z.string()).describe('List of follow-up questions to ask the teacher about the topic.'),
                    }),
                    execute: async ({ hints }) => {
                        return hints
                    }
                }
            }
        })

        return result.toDataStreamResponse()
    } catch (error) {
        console.error('Error al generar la respuesta:', error)
        return NextResponse.json(
            { message: 'Error al procesar la solicitud' },
            { status: 500 }
        )
    }
}
