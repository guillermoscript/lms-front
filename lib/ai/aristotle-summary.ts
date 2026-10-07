/**
 * Generates a session summary using AI when a session ends.
 * The summary is injected into future sessions as memory.
 */

import { generateText, type LanguageModel } from 'ai'

interface Message {
    role: string
    content: string
}

/**
 * `model` is the school's resolved `aristotle_summary` model (it inherits the
 * `aristotle` mapping, including a per-course override). There is no default:
 * the caller resolves it from the tenant's own key.
 */
export async function generateSessionSummary(messages: Message[], model: LanguageModel): Promise<{
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
        model,
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
        // Not every provider honours "no markdown": tolerate a ```json fence.
        const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
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
