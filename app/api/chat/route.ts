import { openai } from '@ai-sdk/openai'
import { StreamingTextResponse, streamText } from 'ai'
import { ollama } from 'ollama-ai-provider'
import { google } from '@ai-sdk/google'

export async function POST (req: Request) {
  const { messages } = await req.json()

  const result = await streamText({
    model: google('models/gemini-pro'),
    // model: ollama('llama3'),
    // model: openai('gpt-4o'),
    messages,
    temperature: 0
  })

  return new StreamingTextResponse(result.toAIStream())
}