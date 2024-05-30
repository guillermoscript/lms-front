import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {

    const body = await req.json();
    const supabase = createClient();
    const getUserData = await supabase.auth.getUser();

    if (getUserData.error) {
        return NextResponse.json({ error: 'No user found' }, { status: 401 });
    }

    const submission_id = Number(body.submission_id);
    const examId = Number(body.exam_id);
    const studentId = body.student_id;
    const answers = body.answers;
    const score = body.score;
    const overallFeedback = body.overall_feedback;

    const { error } = await supabase.rpc('save_exam_feedback', {
        p_submission_id: submission_id,
        p_exam_id: examId,
        p_student_id: studentId,
        p_answers: answers,
        p_overall_feedback: overallFeedback,
        p_score: score
    });

    if (error) {
        console.error('Error updating feedback:', error.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 502 });
    } else {
        console.log('Feedback saved successfully');
    }

    return NextResponse.json({ message: 'success' }, { status: 201 });
}
