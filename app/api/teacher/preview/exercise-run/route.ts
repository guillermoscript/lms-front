import { generateText, Output } from 'ai'
import { z } from 'zod'
import { PreviewDraftSchema } from '@/lib/exercises/preview'
import { authorizeExercisePreview, checkExercisePreviewBudget } from '@/lib/exercises/preview-auth'
import { evaluateWrittenExercise } from '@/lib/exercises/evaluate-written'
import { evaluateArtifactExercise } from '@/lib/exercises/evaluate-artifact'
import { CLOSED_EXERCISE_TYPES, parseCheckpointQuestions } from '@/lib/checkpoints/types'
import { gradeCheckpointQuestions } from '@/lib/checkpoints/grading'
import { ConversationTranscriptSchema, ConversationNotesSchema, ConversationEvaluationSchema, buildConversationGraderPrompt, parseConversationConfig } from '@/lib/speech/conversation'
import { AI_MODELS } from '@/lib/ai/config'
import { runSpeechPipeline } from '@/lib/speech/pipeline'
import { getPipeline } from '@/lib/speech/registry'
import { parseSpeechRubricConfig } from '@/lib/speech/learner-rubric'
import type { ExerciseContext } from '@/lib/speech/types'
import { hasPlanFeature } from '@/lib/plans/server'

export const maxDuration = 240
const MAX_MEDIA_BYTES = 25 * 1024 * 1024
const inputSchema = z.object({
  draft: PreviewDraftSchema,
  content: z.string().max(60_000).optional(),
  transcript: ConversationTranscriptSchema.optional(),
  notes: ConversationNotesSchema.optional(),
  answers: z.array(z.object({ questionId: z.string().max(200), value: z.union([z.string().max(4000), z.number(), z.boolean()]) })).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().refine((value) => JSON.stringify(value ?? {}).length <= 10_000),
})

/** Actual evaluators, no submissions/completions/XP writes. Drafts need not be published or saved. */
export async function POST(req: Request) {
  let raw: unknown
  let media: File | null = null
  try {
    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      if (Number(req.headers.get('content-length')) > MAX_MEDIA_BYTES + 250_000) {
        return Response.json({ error: 'Preview media must be under 25 MB' }, { status: 413 })
      }
      const form = await req.formData()
      raw = { draft: JSON.parse(String(form.get('draft'))) }
      const file = form.get('media')
      if (!(file instanceof File) || !file.size || file.size > MAX_MEDIA_BYTES) {
        return Response.json({ error: 'Preview media must be under 25 MB' }, { status: 413 })
      }
      media = file
    } else {
      raw = await req.json()
    }
  } catch {
    return Response.json({ error: 'Invalid preview input' }, { status: 400 })
  }
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return Response.json({ error: 'Invalid preview input' }, { status: 400 })
  const { draft, content, transcript, answers, notes, metadata } = parsed.data
  const auth = await authorizeExercisePreview(req, draft.courseId)
  if (auth instanceof Response) return auth
  const config = draft.exercise_config
  const passingScore = typeof config.passing_score === 'number' ? Math.min(100, Math.max(0, config.passing_score)) : 70
  const isMedia = draft.exercise_type === 'audio_evaluation' || draft.exercise_type === 'video_evaluation'
  const isConversation = draft.exercise_type === 'real_time_conversation'
  const questions = (CLOSED_EXERCISE_TYPES as readonly string[]).includes(draft.exercise_type) ? parseCheckpointQuestions(config) : null
  if ((isMedia && !media) || (isConversation && !transcript?.some((turn) => turn.role === 'user')) || (!isMedia && !isConversation && !questions && !content?.trim())) {
    return Response.json({ error: 'A test response is required' }, { status: 400 })
  }
  if (questions) {
    const grade = gradeCheckpointQuestions(questions, answers ?? [])
    return Response.json({ ...grade, passed: grade.score >= passingScore, passingScore, preview: true, evaluator: 'deterministic' })
  }
  if (isConversation && !(await hasPlanFeature(auth.tenantId, 'voice_exercises'))) {
    return Response.json({ error: 'Voice exercises are not included in this school’s plan' }, { status: 403 })
  }
  let mediaMime = ''
  if (isMedia && media) {
    mediaMime = media.type.split(';')[0]
    const allowed = draft.exercise_type === 'audio_evaluation'
      ? ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a', 'audio/aac']
      : ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg']
    if (!allowed.includes(mediaMime)) return Response.json({ error: 'Unsupported media type' }, { status: 400 })
  }
  const denied = await checkExercisePreviewBudget(auth)
  if (denied) return denied
  try {
    if (isConversation) {
      const conversation = parseConversationConfig(config)
      const { output } = await generateText({ model: AI_MODELS.grader,
        output: Output.object({ schema: ConversationEvaluationSchema }),
        system: buildConversationGraderPrompt(draft, conversation, notes ?? []),
        prompt: JSON.stringify({ transcript }),
      })
      if (!output) throw new Error('No evaluation')
      const score = Math.round(output.score)
      return Response.json({ ...output, score, passed: score >= conversation.passing_score, passingScore: conversation.passing_score, preview: true, evaluator: 'ai' })
    }
    if (isMedia && media) {
      const context: ExerciseContext = {
        title: draft.title, instructions: draft.instructions,
        topic_prompt: typeof config.topic_prompt === 'string' ? config.topic_prompt : '',
        rubric: config.rubric as ExerciseContext['rubric'], speechRubric: parseSpeechRubricConfig(config), passingScore,
      }
      // The STT provider uploads these bytes exactly as it uploads stored media.
      // No permanent LMS media, attempts, or progress records are created.
      const source = `data:${mediaMime};base64,${Buffer.from(await media.arrayBuffer()).toString('base64')}`
      const providers = getPipeline(typeof config.stt_provider === 'string' ? config.stt_provider : 'assemblyai', typeof config.ai_coach === 'string' ? config.ai_coach : 'openai')
      const evaluation = await runSpeechPipeline(source, context, providers)
      return Response.json({ ...evaluation, feedback: evaluation.focus_next, passed: evaluation.score >= passingScore, passingScore, preview: true, evaluator: 'ai' })
    }
    const result = draft.exercise_type === 'artifact'
      ? { evaluation: await evaluateArtifactExercise(draft, content!, metadata), passingScore }
      : await evaluateWrittenExercise(draft, content!)
    const score = Math.min(100, Math.max(0, Math.round(result.evaluation.score)))
    return Response.json({ ...result.evaluation, score, passed: score >= result.passingScore, passingScore: result.passingScore, preview: true, evaluator: 'ai' })
  } catch (error) {
    console.error('Exercise preview evaluation failed:', error)
    return Response.json({ error: 'Evaluation failed' }, { status: 502 })
  }
}
