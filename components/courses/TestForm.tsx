'use client'

import { testActionSubmit } from '@/actions/actions'
import { Database } from '@/utils/supabase/supabase'
import { useForm } from 'react-hook-form'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export default function TestForm ({
  test_questions,
  test_id,
  course_id,
  children
}: {
  test_questions: Array<Database['public']['Tables']['test_questions']['Row']>
  test_id: number
  course_id: number
  children?: React.ReactNode
}) {
  const { register, watch, formState: { errors, isValid, dirtyFields } } = useForm()

  return (
    <form className="flex flex-col gap-4" action={ async (formData) => {
		  if (!isValid) {
		    console.log('Form is not valid')
		    return
		  }
		  formData.append('test_id', test_id.toString())
		  formData.append('course_id', course_id.toString())
		  const data = await testActionSubmit(formData)
		  if (data) {
		    console.log('Test submitted')
		  } else {
		    console.log('Test not submitted')
		  }
    }}
    >
      <div className="flex flex-col gap-4 py-3">
        {test_questions.map((question) => {
				  return (
  <div
    key={question.id}
    className="flex flex-col gap-4"
  >
    <QuestionOption
      question_type={question.question_type}
      question_options={question?.question_options }
      question={question}
      register={register}
      errors={errors}
    />
  </div>
				  )
        })}
      </div>
      {children}
    </form>
  )
}

function QuestionOption ({
  question_type,
  question_options,
  question,
  register,
  errors
}: {
  question_type: Database['public']['Tables']['test_questions']['Row']['question_type']
  question_options: Array<Database['public']['Tables']['question_options']['Row']>
  question: Database['public']['Tables']['test_questions']['Row']
  register: any
  errors: any
}) {
  if (question_type === 'multiple_choice') {
    return (
      <div className="flex flex-col justify-start gap-4">
        <h3 className="text-xl font-semibold text-left tracking-tight">
          Multiple choice
        </h3>
        {question_options.map((option) => {
          return (
            <div className="flex flex-row justify-start gap-4 items-center">
              <Input
                type="checkbox"
                name={`${question.id}-${option.id}`}
                id={`${question.id}-${option.id}`}
                {...register(`${question.id}-${option.id}`)}
              />
              <Label htmlFor={`${question.id}-${option.id}`}>
                {option.question_option_localizations[0].option_text}
              </Label>
            </div>
          )
        })}
      </div>
    )
  }

  if (question_type === 'free_text') {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-semibold text-left tracking-tight">
          Fill your answer
        </h3>
        <Label htmlFor={`${question.id}`}>
          {question.test_question_localizations[0].question_text}
        </Label>
        <Input
          type="text"
          name={`${question.id}`}
          id={`${question.id}`}
          {...register(`${question.id}`, {
            required: 'This field is required'
          })}
        />
        {
                    errors[`${question.id}`] && errors[`${question.id}`].message
                }
      </div>
    )
  }

  if (question_type === 'true_false') {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-semibold text-left tracking-tight">
          True or false
        </h3>
        <h4 className="text-xl font-semibold text-left tracking-tight">
          {question?.test_question_localizations[0].question_text}
        </h4>
        <div className="flex flex-col gap-4">
          <div className="flex flex-row gap-4 items-center">
            <Input
              type="radio"
              name={`${question.id}`}
              id={`${question.id}`}
              value="TRUE"
              className="w-6 h-6"
              {...register(`${question.id}`) }
            />
            <Label htmlFor={`${question.id}`}>Verdadero</Label>
          </div>
          <div className="flex flex-row gap-4 items-center">
            <Input
              type="radio"
              name={`${question.id}`}
              id={`${question.id}`}
              value="FALSE"
              className="w-6 h-6"
              {...register(`${question.id}`)}
            />
            <Label htmlFor={`${question.id}`}>Falso</Label>
          </div>
        </div>
      </div>
    )
  }

  return null
}
