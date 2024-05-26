// import { openai } from '@ai-sdk/openai';
import { StreamingTextResponse, streamText } from 'ai';
import { ollama } from 'ollama-ai-provider';

export async function POST(req: Request) {
    const { messages } = await req.json();

    const result = await streamText({
        model: ollama('llama3'),
        messages,
    });

    return new StreamingTextResponse(result.toAIStream());
}