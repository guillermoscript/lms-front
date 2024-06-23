import { google } from '@ai-sdk/google'
import { StreamingTextResponse, streamText } from 'ai'

import { createClient } from '@/utils/supabase/server'
// Allow streaming responses up to 30 seconds
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST (req: Request) {
    const { messages, chatId } = await req.json()
    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return Response.redirect('/login')
    }

    const result = await streamText({
        model: google('models/gemini-1.5-pro-latest'),
        messages,
        temperature: 0,
        async onFinish (event) {
            const lastUserMessage = messages[messages.length - 1]

            console.log(messages)

            console.log(lastUserMessage)

            const chat_id = chatId ?? (await supabase.from('chats').select('chat_id').eq('title', lastUserMessage.content).single()).data.chat_id

            console.log(chat_id)

            const messageInsert = await supabase.from('messages').insert([
                {
                    chat_id,
                    message: lastUserMessage.content,
                    created_at: new Date().toISOString(),
                    sender: 'user'
                },
                {
                    chat_id,
                    message: event.text,
                    created_at: new Date().toISOString(),
                    sender: 'assistant'
                }

            ])

            if (messageInsert.error) {
                console.log('Error creating message', messageInsert.error)
            }

            console.log('Message sent successfully')
        }
    })

    return new StreamingTextResponse(result.toAIStream())
}
