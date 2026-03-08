/**
 * Generates a session summary using AI when a session ends.
 * The summary is injected into future sessions as memory.
 */

import { generateText } from 'ai'
import { AI_MODELS } from './config'

interface Message {
    role: string
    content: string
}

export async function generateSessionSummary(messages: Message[]): Promise<{
    summary: string
    topics: string[]
}> {
    if (messages.length === 0) {
        return { summary: '', topics: [] }
    }

    const conversationText = messages
        .map(m => `${m.role === 'user' ? 'Student' : 'Aristotle'}: ${m.content}`)
        .join('\n')

    const { text } = await generateText({
        model: AI_MODELS.aristotle,
        system: `You summarize tutoring conversations. Output JSON only, no markdown.

Format: {"summary": "...", "topics": ["topic1", "topic2"]}

Rules:
- Summary: 1-3 sentences capturing what the student asked, what they struggled with, and what they understood. Max 200 words.
- Topics: 2-5 short topic labels (e.g., "recursion", "loop syntax", "exam prep").
- Focus on the student's understanding level, not just what was discussed.
- Note any misconceptions or breakthroughs.`,
        prompt: `Summarize this tutoring session:\n\n${conversationText}`,
    })

    try {
        const parsed = JSON.parse(text)
        return {
            summary: parsed.summary || '',
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        }
    } catch {
        // Fallback if AI doesn't return valid JSON
        return {
            summary: text.slice(0, 500),
            topics: [],
        }
    }
}
