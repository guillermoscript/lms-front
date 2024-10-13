import { google } from '@ai-sdk/google'
import { convertToCoreMessages, Message, streamText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'

interface RequestBody {
    messages: Message[];
}

export async function POST(request: NextRequest) {
    try {
        const reqBody: RequestBody = await request.json()
        const model = google('gemini-1.5-flash')

        const result = await streamText({
            model,
            messages: convertToCoreMessages(reqBody.messages),
            temperature: 0.7,
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
