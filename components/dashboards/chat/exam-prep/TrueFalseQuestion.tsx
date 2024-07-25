import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SingleSelectQuestion as typeSingleSelectQuestion } from '@/utils/types'
export default function TrueFalseQuestion ({ question, isFinished, form }: { question: typeSingleSelectQuestion, isFinished: boolean, form: any }) {
    return (
        <Card key={question.id}>
            <CardHeader>
                <CardTitle>True or False</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <>
                    <h4 className="text-sm font-semibold">{question.text}</h4>
                    <div className="flex items-center gap-2">
                        <input
                            disabled={isFinished}
                            type="radio" id={`${question.id}-true`} value="True" name={question.id} {...form.register(`${question.id}`)}
                        />
                        <label htmlFor={`${question.id}-true`}>True</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            disabled={isFinished}
                            type="radio" id={`${question.id}-false`} value="False" name={question.id} {...form.register(`${question.id}`)}
                        />
                        <label htmlFor={`${question.id}-false`}>False</label>
                    </div>
                </>
            </CardContent>
        </Card>
    )
}
