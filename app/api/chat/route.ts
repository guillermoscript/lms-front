// app/api/chat/route.ts
import { OpenAI } from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { cookies } from 'next/headers'
// import { supabaseClient } from '@/utils/supabase'

type SuccesRpcResponse =  {
    id: number
    content: string
    metadata: Metadata
    embedding: number[]
    similarity: number
}
export interface Metadata {
    chat_id: string
    document_id: string
}

export const runtime = 'edge'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(req: Request) {

    // check user cookie
    const cookieStore = cookies()
    const payloadCookie = cookieStore.get('payload-token')

    if (!payloadCookie) {
        return {
            status: 401,
            body: {
                message: 'Unauthorized'
            }
        }
    }

    // Extract the `messages` from the body of the request
    // if the other fields are needed, they can be extracted here as well
    const {
        messages,
        maxLength,
        temperature,
        selectedModel,
        type,
        chatId
    } = await req.json();

    const model = selectedModel?.name

    // if (type === 'qa') {
    //     // grab las user message, messages is an array of objects with role: string, content: string, check the last user message
    //     const question = messages[messages.length - 1].content
    //     console.log(question)
    //     try {

    //         const questionEmbedding = await openai.embeddings.create({
    //             input: question,
    //             model: 'text-embedding-ada-002'
    //         })
    //         const questionEmbeddingVector = questionEmbedding.data[0].embedding as number[]
    //         const { error, data} = await supabaseClient.rpc(
    //             'match_documents',
    //             {
    //                 query_embedding: questionEmbeddingVector,
    //                 filter: {
    //                     chat_id: chatId
    //                 },
    //                 match_threshold: 0.81,
    //             //   match_count: 10,
    //             //   min_content_length: 50,
    //             }
    //         )
    //         if (error) {
    //             console.log(error)
    //             return {
    //                 status: 500,
    //                 body: {
    //                     message: 'Internal Server Error'
    //                 }
    //             }
    //         }

    //         const dataType = data as SuccesRpcResponse[]
    //         const topFiveMatches = dataType.sort((a, b) => b.similarity - a.similarity).slice(0, 5)
    //         console.log(topFiveMatches)
    //         const systemPrompt = `Given the following sections from a pdf, answer the question using only that information,
    //         outputted in markdown format. If you are unsure and the answer
    //         is not explicitly written in the documentation, say
    //         "Sorry, I don't know how to help with that." or respond in the asked language.
    //         Context (section from the pdf):
    //         ---
    //         ${topFiveMatches.map((match) => match.content).join('\n---\n')}
    //         ---
    //         Question:
    //         ---
    //         ${question}
    //         ---`

    //         console.log(topFiveMatches, 'topFiveMatches')

    //         messages[0].content = systemPrompt
    //         messages[0].role = 'system'

    //         console.log(messages)
    //         // Request the OpenAI API for the response based on the prompt
    //         const response = await openai.chat.completions.create({
    //             model: model || 'gpt-3.5-turbo',
    //             stream: true,
    //             messages: messages,
    //             max_tokens: maxLength[0] || 256,
    //             temperature: temperature[0] || 0.5,
    //             top_p: 1,
    //             frequency_penalty: 1,
    //             presence_penalty: 1,
    //         })

    //         // Convert the response into a friendly text-stream
    //         const stream = OpenAIStream(response, {
    //             onFinal(completion) {
    //                 console.log(completion, 'completion')
    //             },
    //         })

    //         // Respond with the stream
    //         return new StreamingTextResponse(stream)

    //     } catch (error) {
    //         console.log(error)
    //         return new Response('error', {
    //             status: 500,
    //             headers: {
    //                 'content-type': 'application/json',
    //             },
    //         }).json()
    //     }
    // }

    // Request the OpenAI API for the response based on the prompt
    const response = await openai.chat.completions.create({
        model: model || 'gpt-3.5-turbo',
        stream: true,
        messages: messages,
        max_tokens: maxLength[0] || 256,
        temperature: temperature[0] || 0.5,
        top_p: 1,
        frequency_penalty: 1,
        presence_penalty: 1,
    })

    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response)

    // Respond with the stream
    return new StreamingTextResponse(stream)
}

