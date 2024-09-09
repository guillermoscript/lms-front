import { Label } from '@/components/ui/label'

interface Answer {
    answer_id: number
    is_correct: boolean
}

export type CorrectnessRadioProps = {
    answer: Answer
    onChange: (answerId: number, isCorrect: boolean) => void
}

export default function CorrectnessRadio({
    answer,
    onChange: handleCorrectnessChange
}: CorrectnessRadioProps) {

    const handleChange = (value: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
        handleCorrectnessChange(answer.answer_id, value)
    }

    return (
        <div className="flex items-center gap-2">
            <Label className="flex items-center gap-2">
                <input
                    type="radio"
                    name={`correctness-${answer.answer_id}`}
                    value="true"
                    checked={answer?.is_correct === true}
                    onChange={handleChange(true)}
                    className="h-4 w-4 rounded border-gray-300"
                />

                <span>Yes</span>
            </Label>

            <Label className="flex items-center gap-2">
                <input
                    type="radio"
                    name={`correctness-${answer.answer_id}`}
                    value="false"
                    checked={answer?.is_correct === false}
                    onChange={handleChange(false)}
                    className="h-4 w-4 rounded border-gray-300"
                />
                <span>No</span>
            </Label>
        </div>
    )
}