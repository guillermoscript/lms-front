
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request,
    { params }: { params: { examId: string } }
) {
    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error != null) {
        return new Response('User not found', { status: 404 })
    }

    // Assuming 'examId' corresponds to 'submission_id' in 'exam_submissions'
    const { data, error } = await supabase
        .from('exam_submissions')
        .select('ai_data')
        .eq('submission_id', params.examId)
        .eq('student_id', userData.data?.user?.id)
        .single()

    if (error != null) {
        return new Response('Error fetching AI data', { status: 500 })
    }

    return Response.json(data)
}
