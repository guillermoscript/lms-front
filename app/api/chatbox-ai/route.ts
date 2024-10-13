import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'

interface RequestBody {
    message: string;
    instructions: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const reqBody: RequestBody = await request.json()
        const { message, instructions } = reqBody
        const model = google('gemini-1.5-flash')

        const result = await generateText({
            model,
            system: `Act like a teacher. Always provide responses in plain text without using any markdown or special formatting like **, _ or other font styles. Respond naturally and clearly. ${instructions}`,
            prompt: message,
            temperature: 0.7,
        })

        const responseText = result.text

        return new NextResponse(responseText)
    } catch (error) {
        console.error('Error al generar la respuesta:', error)
        return NextResponse.json(
            { message: 'Error al procesar la solicitud' },
            { status: 500 }
        )
    }
}
