import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
  const submitExam = async (studentId: string, examId: number, answers: any[]) => {
    const { data, error } = await supabase
      .rpc('create_exam_submission', {
        p_answers: answers,
        p_exam_id: examId,
        p_student_id: studentId
      })

    if (error != null) {
      console.error('Error submitting exam:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 502 })
    } else {
      console.log('Exam submission response:', data)
      return NextResponse.json({ message: 'success' }, { status: 201 })
    }
  }

  return await submitExam(studentId, examId, answers)
}
