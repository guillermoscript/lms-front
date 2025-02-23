import { createAISDKTools } from '@agentic/ai-sdk'
import { TavilyClient } from '@agentic/tavily'
import { openai } from '@ai-sdk/openai'
import { convertToCoreMessages, Message, streamText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/utils/supabase/server'
interface RequestBody {
    messages: Message[];
}

export async function POST(request: NextRequest) {
    try {
        const supabase = createClient()

        const { data, error } = await supabase
            .auth.getUser()

        if (error) {
            console.error('Error fetching user:', error)
            return NextResponse.json(
                { message: 'Error fetching user' },
                { status: 500 }
            )
        }

        const reqBody: RequestBody = await request.json()
        const tavilSearch = new TavilyClient()
        const model = openai('gpt-4o-mini')
        // , {
        //     user: data.user.id
        // }

        const result = streamText({
            model,
            messages: convertToCoreMessages(reqBody.messages),
            temperature: 0.7,
            tools: {
                ...createAISDKTools(),
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
