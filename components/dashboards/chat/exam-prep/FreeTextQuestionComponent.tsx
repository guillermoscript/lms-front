import { Label } from '@radix-ui/react-label'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { FreeTextQuestion } from '@/utils/types'

export default function FreeTextQuestionComponent ({
    question,
    isFinished,
    form
}: {
    question: FreeTextQuestion
    isFinished: boolean
    form: any
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Free Text</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <Label htmlFor={question.id}>{question.label}</Label>
                <Textarea
                    disabled={isFinished}
                    id={question.id}
                    {...form.register(question.id)}
                />
            </CardContent>
        </Card>
    )
}
