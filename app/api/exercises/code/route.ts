import { NextRequest, NextResponse } from 'next/server'

import { markExerciseCompletedAction, saveUserSubmissionAction } from '@/actions/dashboard/exercisesActions'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { exerciseId, submissionCode } = body

        if (!exerciseId || !submissionCode) {
            return NextResponse.json(
                { status: 'error', message: 'Invalid submission data' },
                { status: 400 }
            )
        }

        const supabase = createClient()
        const userData = await supabase.auth.getUser()

        if (userData.error) {
            console.log(userData.error)
            return NextResponse.json(
                { status: 'error', message: 'Unauthorized access' },
                { status: 403 }
            )
        }

        // search for the last submission
        const savedCode = await saveUserSubmissionAction({
            exerciseId,
            submissionCode,
        })

        if (savedCode.status === 'error') {
            console.error('Failed to save code')
            return NextResponse.json(
                { status: 'error', message: 'Failed to save code' },
                { status: 500 }
            )
        }

        const res2 =
            await markExerciseCompletedAction({
                exerciseId,
            })

        if (res2.status === 'error') {
            console.error('Failed to save code')
            return NextResponse.json(
                { status: 'error', message: 'Failed to save code' },
                { status: 500 }
            )
        }

        console.log(res2)

        return NextResponse.json(
            { status: 'success', message: 'Code submitted successfully' },
            { status: 200 }
        )
    } catch (e) {
        console.log(e)
        return NextResponse.json(
            { status: 'error', message: 'Error submitting code' },
            { status: 500 }
        )
    }
}
