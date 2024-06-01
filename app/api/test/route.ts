import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'
import { NextResponse } from 'next/server'

interface Root {
  sequence: number
  questions: any[]
  duration: number
  exam_date: string
  course: number
  testDescription: string
  testName: string
  language: any[]
  retakeInterval: string
  timeForTest: number
  formFields: FormField[]
  status: Tables<'exams'>['status']
}

interface FormField {
  type: 'true_false' | 'multiple_choice' | 'free_text'
  label: string
  options: Option[]
  required: boolean
  value?: boolean
}

interface Option {
  label: string
  value: boolean
  correct: boolean
}

export async function POST (req: Request) {
  try {
    const frontendJSON: Root = await req.json()
    const supabase = createClient()

    console.log(frontendJSON)

    const { testName: title, testDescription: description, course, status, duration, exam_date, formFields, sequence } = frontendJSON

    // Validate question types
    const validQuestionTypes = ['true_false', 'multiple_choice', 'free_text']

    for (const field of formFields) {
      if (!validQuestionTypes.includes(field.type)) {
        return NextResponse.json({ error: `Invalid question type: ${field.type}` }, { status: 400 })
      }
    }

    // Insert into exams table
    const { data: examData, error: examError } = await supabase.from('exams').insert({
      title,
      description,
      course_id: course,
      status,
      sequence,
      duration,
      exam_date
    }).select()

    if (examError != null) {
      console.error(examError)
      return NextResponse.json({ error: examError.message }, { status: 500 })
    }

    if (!formFields || formFields.length === 0) {
      return NextResponse.json({
        data: examData,
        message: 'Exam created without any questions.'
      }, { status: 200 })
    }

    const questionsToInsert = formFields.map((field: FormField) => ({
      question_text: field.label,
      question_type: field.type,
      exam_id: examData[0].exam_id
    }))

    const { data: questionData, error: questionError } = await supabase.from('exam_questions').insert(questionsToInsert).select()

    if (questionError != null) {
      console.error(questionError)
      return NextResponse.json({ error: questionError.message }, { status: 500 })
    }

    const questionOptionsToInsert = formFields.flatMap((field: FormField, index: number) => {
      if (field.type !== 'true_false' && field.type !== 'multiple_choice') {
        return []
      }

      return field.options.map((option: Option) => ({
        question_id: questionData[index].question_id,
        option_text: option.label,
        is_correct: option.value
      }))
    })

    if (questionOptionsToInsert.length > 0) {
      const { error: optionsError } = await supabase.from('question_options').insert(questionOptionsToInsert)

      if (optionsError != null) {
        console.error(optionsError)
        return NextResponse.json({ error: optionsError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      exam: examData[0],
      questions: questionData,
      options: questionOptionsToInsert,
      message: 'Exam created successfully.'
    }, { status: 200 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

interface UpdateRoot {
  sequence: number
  questions: any[]
  duration: number
  exam_date: string
  course: number
  testDescription: string
  testName: string
  language: any[]
  retakeInterval: string
  timeForTest: number
  formFields: UpdateFormField[]
  status: Tables<'exams'>['status']
  exam_id: number
}

interface UpdateFormField {
  type: 'true_false' | 'multiple_choice' | 'free_text'
  label: string
  options: UpdateOption[]
  required: boolean
  value?: boolean
  questionId?: number
}

interface UpdateOption {
  label: string
  value: boolean
  correct?: boolean
  option_id?: number
  is_correct?: boolean
  question_id?: number
}

export async function PUT (req: Request) {
  try {
    const frontendJSON: UpdateRoot = await req.json()
    const supabase = createClient()
    const { exam_id, formFields, testName: title, testDescription: description, course, status, duration, exam_date } = frontendJSON

    // Validate exam_id
    if (!exam_id) {
      return NextResponse.json({ error: 'Missing exam_id' }, { status: 400 })
    }

    // Update exam details
    const { error: examUpdateError } = await supabase.from('exams').update({
      title,
      description,
      course_id: course,
      status,
      duration,
      exam_date
    }).eq('exam_id', exam_id)

    if (examUpdateError != null) {
      console.error(examUpdateError)
      return NextResponse.json({ error: examUpdateError.message }, { status: 500 })
    }

    // Validate question types
    const validQuestionTypes = ['true_false', 'multiple_choice', 'free_text']

    for (const field of formFields) {
      if (!validQuestionTypes.includes(field.type)) {
        return NextResponse.json({ error: `Invalid question type: ${field.type}` }, { status: 400 })
      }
    }

    // Update or insert questions and options
    for (const field of formFields) {
      let questionId = field.questionId

      // Upsert exam questions
      if (questionId) {
        // Update existing question
        const { error: questionUpdateError } = await supabase.from('exam_questions').update({
          question_text: field.label,
          question_type: field.type
        }).eq('question_id', questionId)

        if (questionUpdateError != null) {
          console.error(questionUpdateError)
          return NextResponse.json({ error: questionUpdateError.message }, { status: 500 })
        }
      } else {
        // Insert new question
        const { data: insertedQuestion, error: questionInsertError } = await supabase.from('exam_questions').insert({
          question_text: field.label,
          question_type: field.type,
          exam_id
        }).select()

        if (questionInsertError != null) {
          console.error(questionInsertError)
          return NextResponse.json({ error: questionInsertError.message }, { status: 500 })
        }

        questionId = insertedQuestion[0].question_id
      }

      // Update or insert question options
      if (field.type === 'true_false' || field.type === 'multiple_choice') {
        for (const option of field.options) {
          if (option.option_id) {
            // Update existing option
            const { error: optionUpdateError } = await supabase.from('question_options').update({
              option_text: option.label,
              is_correct: option.value
            }).eq('option_id', option.option_id)

            if (optionUpdateError != null) {
              console.error(optionUpdateError)
              return NextResponse.json({ error: optionUpdateError.message }, { status: 500 })
            }
          } else {
            // Insert new option
            const { error: optionInsertError } = await supabase.from('question_options').insert({
              question_id: questionId,
              option_text: option.label,
              is_correct: option.value
            })

            if (optionInsertError != null) {
              console.error(optionInsertError)
              return NextResponse.json({ error: optionInsertError.message }, { status: 500 })
            }
          }
        }
      }
    }

    return NextResponse.json({ message: 'Exam updated successfully' }, { status: 200 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
