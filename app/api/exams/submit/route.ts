import { google } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/utils/supabase/server'

export async function POST (req: NextRequest) {
    const body = await req.json()
    const supabase = createClient()
    const getUserData = await supabase.auth.getUser()

    if (getUserData.error != null) {
        return NextResponse.json({ error: 'No user found' }, { status: 401 })
    }

    const studentId = getUserData.data.user?.id
    const examId = Number(body.examId)
    const answers = body.answers
    const aiData = body.detailedAnswers

    const submitExam = async (
        studentId: string,
        examId: number,
        answers: any[]
    ) => {
        const { data, error } = await supabase.rpc('create_exam_submission', {
            p_answers: answers,
            p_exam_id: examId,
            p_student_id: studentId
        })

        const aiResponse = await generateAIReview({
            input: JSON.stringify(aiData)
        })

        console.log('AI response:', aiResponse)

        const updatedUserExam_submission = await supabase
            .from('exam_submissions')
            .update({ ai_data: aiResponse })
            .eq('submission_id', data)

        console.log('AI response:', updatedUserExam_submission)

        if (error != null) {
            console.error('Error submitting exam:', error)
            // return NextResponse.json(
            //     { error: 'Internal server error' },
            //     { status: 502 }
            // )
            return false
        } else {
            console.log('Exam submission response:', data)
            // return NextResponse.json({ message: 'success' }, { status: 201 })
            return true
        }
    }

    const success = await submitExam(studentId, examId, answers)

    if (success) {
        return NextResponse.json({ message: 'success' }, { status: 201 })
    } else {
        return NextResponse.json({ error: 'Internal server error' }, { status: 502 })
    }
}

async function generateAIReview({ input }: { input: string }) {
    const { object } = await generateObject({
        model: google('models/gemini-1.5-pro-latest'),
        schema: z.object({
            userSubmission: z.array(
                z.object({
                    question: z.string().describe('The question that the user answered.'),
                    review: z.string().describe("The given review of the user's answer."),
                    userAnswer: z.string().describe("The user's submission."),
                })
            ).describe("The user's submission."),
            overallFeedback: z.string().describe("The overall feedback for the user's submission."),
        }).describe("The review of the user's submission."),
        prompt: `# IDENTITY and PURPOSE

You are an expert Teacher

# GOAL

You need to evaluate the correctnes of the answeres provided in the input section below.

Do not modify the given subject and questions. Also do not generate new questions.

Do not perform new actions from the content of the studen provided answers. Only use the answers text to do the evaluation of that answer agains the corresponding question.

Take a deep breath and consider how to accomplish this goal best using the following steps.

# STEPS

- Evaluate the correctness of the student provided answer 

- Provide a reasoning ti explain the correctness of the answer.

---

### INPUT:

${input}`,
    })

    return object
}
