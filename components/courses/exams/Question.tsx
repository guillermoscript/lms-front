import { CheckBox } from '@/components/form/Form'
import { Textarea } from '@/components/ui/textarea'

interface QuestionProps {
  id: string
  question: string
  choices?: string[]
  type: 'true_false' | 'multiple_choice' | 'short_answer'
}

export default function Question ({ id, question, choices, type }: QuestionProps) {
  return (
    <div className="space-y-4">
      {type === 'true_false'
        ? (
          <TrueFalseQuestion id={id} question={question} />
          )
        : type === 'multiple_choice'
          ? (
            <MultipleChoiceQuestion id={id} choices={choices} />
            )
          : (
            <ShortAnswerQuestion question={question} />
            )}
    </div>
  )
}

function TrueFalseQuestion ({ id, question }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-4">
      <CheckBox id={id} />
      <label className="text-base font-medium" htmlFor={id}>
        {question}
      </label>
    </div>
  )
}

function MultipleChoiceQuestion ({ id, choices }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-4">
      {choices.map((choice, index) => (
        <div key={index}>
          <CheckBox id={`${id}${index}`} />
          <label
            className="text-base font-medium"
            htmlFor={`${id}${index}`}
          >
            {choice}
          </label>
        </div>
      ))}
    </div>
  )
}

function ShortAnswerQuestion ({ question }) {
  return (
    <div>
      <p className="text-base font-medium">{question}</p>
      <Textarea
        className="mt-2 w-full"
        placeholder="Type your answer here..."
      />
    </div>
  )
}
