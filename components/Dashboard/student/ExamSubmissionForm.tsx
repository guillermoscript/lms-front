'use client'
import { Button } from '@/components/ui/button'
import SingleSelectQuestion from '../teacher/test/SingleSelectQuestion'
import { Separator } from '@/components/ui/separator'
import FreeTextQuestionForm from '../teacher/test/FreeTextQuestion'
import MultipleChoiceQuestion from '../teacher/test/MultipleChoiceQuestion'
import { useForm } from 'react-hook-form'
import { Form } from '@/components/ui/form'
import {
  MultipleChoiceQuestion as MCQType,
  FreeTextQuestion as FTQType,
  SingleSelectQuestion as SSQType,
  StudentExamSubmitFormData
} from '@/utils/types'
import axios, { isAxiosError } from 'axios'
import { useToast } from '@/components/ui/use-toast'
import { useRouter } from 'next/navigation'

interface ExamsSubmissionFormProps {
  multipleChoiceQuestions: MCQType[]
  freeTextQuestions: FTQType[]
  singleSelectQuestions: SSQType[]
  examId: number
  courseId: number
}

export default function ExamsSubmissionForm ({
  multipleChoiceQuestions,
  freeTextQuestions,
  singleSelectQuestions,
  examId,
  courseId
}: ExamsSubmissionFormProps) {
  const form = useForm<StudentExamSubmitFormData>({
    defaultValues: generateDefaultValues(
      multipleChoiceQuestions,
      freeTextQuestions,
      singleSelectQuestions
    )
  })

  const router = useRouter()
  const { toast } = useToast()

  async function onSubmit (data: any) {
    // Show spinner or loading indicator
    const payload = parseFormData(data)

    try {
      const res = await axios.post('/api/exams/submit', {
        examId,
        answers: payload
      })

      console.log(res.data)

      toast({
        title: 'Success',
        description: 'Exam submitted successfully'
      })

      router.push(`/dashboard/student/courses/${courseId}/exams/${examId}/review`)
    } catch (e) {
      console.log(e)
      if (isAxiosError(e)) {
        toast({
          title: 'Error',
          description: e.response?.data.error || e.message,
          variant: 'destructive'
        })
      }
    }

    console.log(payload)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        <>
          {singleSelectQuestions.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold">
              True or False
            </h3>

            <SingleSelectQuestion
              questions={singleSelectQuestions}
              control={form.control}
            />
          </div>
          )}

          <Separator className="my-4" />

          {freeTextQuestions.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold">
              Fill in the Blank
            </h3>

            <FreeTextQuestionForm
              questions={freeTextQuestions}
              control={form.control}
            />
          </div>
          )}

          <Separator className="my-4" />

          {multipleChoiceQuestions.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold">
              Multiple Choice
            </h3>

            <MultipleChoiceQuestion
              questions={multipleChoiceQuestions}
              form={form}
            />
          </div>
          )}
        </>

        <div className="flex justify-end gap-2">
          <Button
            disabled={form.formState.isSubmitting}
            type="submit"
          >
            Submit Exam
          </Button>
        </div>
      </form>
    </Form>
  )
}

function parseFormData (data: StudentExamSubmitFormData) {
  const parsedData: Array<{ question_id: string, answer_text: string, question_type: string }> = []

  Object.keys(data).forEach((key) => {
    if (key.includes('-true') || key.includes('-false')) {
      if (data[key] === true) {
        parsedData.push({
          question_id: key.split('-')[0],
          answer_text: key.includes('true') ? 'true' : 'false',
          question_type: 'true_false'
        })
      }
    } else if (Array.isArray(data[key])) {
      data[key]?.forEach((optionId) => {
        if (optionId !== undefined) {
          parsedData.push({
            question_id: key,
            answer_text: optionId as string,
            question_type: 'multiple_choice'
          })
        }
      })
    } else {
      parsedData.push({
        question_id: key,
        answer_text: data[key] as string,
        question_type: 'free_text'
      })
    }
  })

  return parsedData.filter(
    (question) => question.answer_text && question.answer_text !== ''
  )
}

function generateDefaultValues (
  mcq: MCQType[],
  ftq: FTQType[],
  ssq: SSQType[]
) {
  const defaults: StudentExamSubmitFormData = {}
  mcq.forEach((question) => {
    defaults[question.id] = []
  })
  ftq.forEach((question) => {
    defaults[question.id] = ''
  })
  ssq.forEach((question) => {
    defaults[question.id + '-true'] = false
    defaults[question.id + '-false'] = false
  })
  return defaults
}
