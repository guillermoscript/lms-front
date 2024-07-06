
import { Check, CheckCircle, XCircleIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface ExamFeedbackCardProps {
    score: number
    overallFeedback: string
    questionAndAnswerFeedback: Array<{
        question: string
        answer: string
        correctAnswer: string
        feedback: string
    }>
}

export default function ExamFeedbackCard ({
    score,
    overallFeedback,
    questionAndAnswerFeedback
}: ExamFeedbackCardProps) {
    return (
        <div className='flex flex-col gap-4 w-full'>
            <Alert
                className='my-4'
                variant={score >= 10 && score <= 15 ? 'warning' : score < 10 ? 'destructive' : 'success'}
            >
                {score >= 10 && score <= 15 ? (
                    <Check className='w-6 h-6 text-yellow-500' />
                ) : score < 10 ? (
                    <XCircleIcon className='w-6 h-6 text-destructive' />
                ) : (
                    <CheckCircle className='w-6 h-6 text-green-500' />
                )}
                <AlertTitle>
                            Your score is {score}
                </AlertTitle>
                <AlertDescription>
                    {overallFeedback}
                </AlertDescription>
            </Alert>

            {questionAndAnswerFeedback.map((item) => (
                <Card key={item.question}>
                    <CardHeader>
                        <CardTitle>{item.question}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Your Answer: {item.answer}</p>
                        <p>Correct Answer: {item.correctAnswer}</p>
                    </CardContent>
                    <CardFooter className='flex justify-between items-center gap-3'>
                        <p>Feedback: {item.feedback}</p>
                        {item.answer === item.correctAnswer ? (
                            <Badge variant="outline">Correct</Badge>
                        ) : (
                            <Badge variant="destructive">Incorrect</Badge>
                        )}
                    </CardFooter>
                </Card>
            ))}
        </div>
    )
}
