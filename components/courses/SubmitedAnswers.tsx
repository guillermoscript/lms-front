import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface SubmitedAnswersProps {
  testId: string
}

export default async function SubmitedAnswers ({
  testId
}: SubmitedAnswersProps) {
  const cookieStore = cookies()
  const supabase = createClient()

  const submitedAnswers = await supabase
    .from('vw_user_test_submissions')
    .select('*')
    .eq('test_id', testId)

  if (submitedAnswers.error != null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <p className="text-lg font-semibold text-left tracking-tight">
            Aún no has realizado este examen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        {submitedAnswers?.data.map((answer, index) => {
				  if (answer.question_type === 'free_text') {
				    return (
  <>
    <Card>
      <CardHeader>
        <CardTitle>
          <h3 className="text-lg font-semibold text-left tracking-tight">
            Pregunta
          </h3>
        </CardTitle>
        <CardDescription>
          {answer.question_text}
        </CardDescription>
      </CardHeader>
      <CardContent>

        <p className="text-md text-left tracking-tight">
          Respuesta:{' '} {answer.given_answer}
        </p>
      </CardContent>
      <CardFooter>
        {
                                            answer.is_correct
                                              ? (
                                                <p className="text-md text-left tracking-tight">
                                                  Tu respuesta es correcta
                                                </p>

                                                )
                                              : (
                                                <p className="text-md text-left tracking-tight text-neutral-400">
                                                  Espera que el profesor califique tu
                                                  respuesta
                                                </p>
                                                )
                                        }
      </CardFooter>
    </Card>

  </>
				    )
				  }

				  return (
  <>
    <Card>
      <CardHeader>
        <CardTitle>
          <h3 className="text-lg font-semibold text-left tracking-tight">
            Pregunta
          </h3>
        </CardTitle>
        <CardDescription>
          {answer.question_text}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {answer.question_type ===
									'multiple_choice'
          ? (
            <p className="text-md text-left tracking-tight">
              Respuesta:{' '}{answer.option_text}
            </p>
									    )
          : (
            <p className="text-md text-left tracking-tight">
              Respuesta:{' '}{answer.given_answer}
            </p>
									    )}
      </CardContent>
      <CardFooter>
        <p className="text-lg font-semibold text-left tracking-tight">
          {answer.is_correct
            ? (
              <span className="text-green-500">
                Correcto
              </span>
              )
            : (
              <span className="text-red-500">
                Incorrecto
              </span>
              )}
        </p>
      </CardFooter>
    </Card>

  </>
				  )
        })}
      </div>
    </div>
  )
}
