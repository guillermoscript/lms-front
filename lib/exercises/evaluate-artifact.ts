import { generateText } from 'ai'
import { AI_MODELS } from '@/lib/ai/config'
import type { WrittenGradingExercise } from './evaluate-written'

export async function evaluateArtifactExercise(exercise: WrittenGradingExercise, content: string, metadata: Record<string, unknown> = {}) {
  const config = (exercise.exercise_config ?? {}) as { system_prompt?: string; evaluation_criteria?: string }
  const systemPrompt = exercise.system_prompt?.trim() ? exercise.system_prompt : config.system_prompt ?? null
  const evaluationCriteria = config.evaluation_criteria ?? ''
  const systemMessage = systemPrompt
    ? `${systemPrompt}\n\nYou are evaluating a student's submission for an interactive exercise.`
    : 'You are an expert educational evaluator. Evaluate the student submission fairly and constructively.'

  const { text } = await generateText({
    model: AI_MODELS.grader,
    system: systemMessage,
    prompt: `## Exercise: ${exercise.title}

## Instructions Given to Student:
${exercise.instructions}

## Evaluation Criteria:
${evaluationCriteria}

## Student Submission:
${content}

${Object.keys(metadata).length > 0 ? `## Submission Metadata:\n${JSON.stringify(metadata, null, 2)}` : ''}

## Your Task:
Evaluate the student's submission based on the evaluation criteria above. Respond with a JSON object (and nothing else) in this exact format:
{
"score": <number 0-100>,
"feedback": "<overall feedback paragraph>",
"strengths": ["<strength 1>", "<strength 2>"],
"improvements": ["<improvement 1>", "<improvement 2>"]
}

End "feedback" with one short reflective question tied to the most important improvement (e.g. "Before revising: what did you expect X to do, and what did it actually do?"). Write everything in the language of the student's submission.`,
  })

  // Keep the student endpoint’s JSON parsing and score normalization.
  let evaluation: { score: number; feedback: string; strengths: string[]; improvements: string[] }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    evaluation = JSON.parse(jsonMatch[0])
    if (typeof evaluation.score !== 'number') throw new Error('Invalid score')
    evaluation.score = Math.max(0, Math.min(100, Math.round(evaluation.score)))
    evaluation.feedback = evaluation.feedback ?? ''
    evaluation.strengths = Array.isArray(evaluation.strengths) ? evaluation.strengths : []
    evaluation.improvements = Array.isArray(evaluation.improvements) ? evaluation.improvements : []
  } catch {
    throw new Error('Failed to parse AI evaluation')
  }
  return evaluation
}
