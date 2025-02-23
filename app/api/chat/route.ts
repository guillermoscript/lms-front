import { google } from '@ai-sdk/google'
import { streamText } from 'ai'

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

    const result = streamText({
        model: google('gemini-2.0-pro-exp-02-05'),
        messages,
        temperature: 0,
        async onFinish (event) {
            const lastUserMessage = messages[messages.length - 1]

            const chat_id = chatId ?? (await supabase.from('chats').select('chat_id').eq('title', lastUserMessage.content).single()).data.chat_id

            console.log('chat_id', chat_id)
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
        }
    })

    return result.toDataStreamResponse()
}
