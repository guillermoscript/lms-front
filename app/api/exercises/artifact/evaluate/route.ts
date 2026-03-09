import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { generateText } from 'ai'
import { AI_MODELS } from '@/lib/ai/config'

export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const tenantId = await getCurrentTenantId()

  // 1. Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Parse input
  let exerciseId: number
  let content: string
  let metadata: Record<string, unknown> = {}
  try {
    const body = await req.json()
    exerciseId = parseInt(body.exerciseId)
    content = body.content
    metadata = body.metadata ?? {}
    if (isNaN(exerciseId) || exerciseId <= 0) throw new Error('invalid')
    if (!content || typeof content !== 'string') throw new Error('content required')
  } catch {
    return Response.json({ error: 'exerciseId and content are required' }, { status: 400 })
  }

  // 3. Fetch exercise via admin client
  const { data: exercise, error: fetchError } = await adminClient
    .from('exercises')
    .select('id, title, instructions, exercise_type, exercise_config, course_id, tenant_id, courses(tenant_id)')
    .eq('id', exerciseId)
    .single()

  if (fetchError || !exercise) {
    return Response.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // 4. Validate exercise type and tenant
  if (exercise.exercise_type !== 'artifact') {
    return Response.json({ error: 'Not an artifact exercise' }, { status: 400 })
  }
  const courseTenantId = (exercise.courses as any)?.tenant_id
  if (exercise.tenant_id !== tenantId && courseTenantId !== tenantId) {
    return Response.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // 5. Verify enrollment
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()

  if (!enrollment) {
    return Response.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  // 6. Rate limit — max 10 evaluations/hour per exercise+user
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await adminClient
    .from('exercise_evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_id', exerciseId)
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .gte('created_at', oneHourAgo)

  if ((recentCount ?? 0) >= 10) {
    return Response.json({
      error: 'Rate limit exceeded. Maximum 10 evaluations per hour.',
      rateLimited: true,
    }, { status: 429 })
  }

  // 7. Extract server-side config
  const config = (exercise.exercise_config as Record<string, any>) ?? {}
  const evaluationCriteria = config.evaluation_criteria ?? ''
  const systemPrompt = config.system_prompt ?? null
  const passingScore = config.passing_score ?? 70

  // 8. AI evaluation
  try {
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
}`,
    })

    // 9. Parse AI response
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
      return Response.json({ error: 'Failed to parse AI evaluation' }, { status: 500 })
    }

    const passed = evaluation.score >= passingScore

    // 10. Insert evaluation record
    await adminClient.from('exercise_evaluations').insert({
      exercise_id: exerciseId,
      user_id: user.id,
      tenant_id: tenantId,
      engine_type: 'simulation',
      score: evaluation.score,
      passed,
      ai_result: {
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
      },
    })

    // 11. Record completion if passed
    if (passed) {
      await adminClient
        .from('exercise_completions')
        .insert({
          exercise_id: exerciseId,
          user_id: user.id,
          completed_by: user.id,
          score: evaluation.score,
          tenant_id: tenantId,
        })
        .select('id')
        .single()
      // unique index (exercise_id, user_id) prevents duplicates — error is expected on re-pass
    }

    // 12. Return result (never include evaluation_criteria or system_prompt)
    return Response.json({
      score: evaluation.score,
      feedback: evaluation.feedback,
      passed,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      passingScore,
    })
  } catch (err: any) {
    console.error('Artifact evaluation error:', err)
    return Response.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
