'use client'

import { useFormContext } from 'react-hook-form'
import FreeTextQuestion from './FreeTextQuestion'
import SingleSelectQuestion from './SingleSelectQuestion'
import MultipleChoiceQuestion from './MultipleChoiceQuestion'
import categorizeQuestions from './utils/categorizeQuestions'

export default function TestQuestions ({
  test_questions
}: {
  test_questions: any
}) {
  console.log(test_questions)
  const {
    multipleChoiceQuestions,
    freeTextQuestions,
    singleSelectQuestions
  } = categorizeQuestions(test_questions || [])

  const {
    control
  } = useFormContext()

  console.log(multipleChoiceQuestions)

  console.log(freeTextQuestions)

  console.log(singleSelectQuestions)
  return (
    <>
      {singleSelectQuestions.length > 0 && (
      <div>
        <h3 className="text-lg font-semibold">True or False</h3>
        <SingleSelectQuestion
          questions={singleSelectQuestions}
        />
      </div>
      )}
      {freeTextQuestions.length > 0 && (
      <div>
        <h3 className="text-lg font-semibold">Fill in the Blank</h3>
        <FreeTextQuestion
          control={control}
          questions={freeTextQuestions}
        />
      </div>
      )}
      {multipleChoiceQuestions.length > 0 && (
      <div>
        <h3 className="text-lg font-semibold">Multiple Choice</h3>
        <MultipleChoiceQuestion
          questions={multipleChoiceQuestions}
        />
      </div>
      )}
    </>
  )
}
