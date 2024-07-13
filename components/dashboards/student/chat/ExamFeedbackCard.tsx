import {
    Check,
    CheckCircle,
    CheckIcon,
    PencilLineIcon,
    XCircleIcon
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from '@/components/ui/card'

import { FeedbackComponent, FeedbackComponentProps } from './exam-prep/MatchingTextQuestionComponent'
import { MultipleChoiceQuestionInterface, QuizFeedback } from './exam-prep/MultipleChoiceQuestionComponent'

interface basicQuestion {
    question: string
    answer: string
    correctAnswer: string
    feedback: string
}

interface ExamFeedbackCardProps {
    score?: number
    overallFeedback?: string
    freeTextQuestionFeedback: basicQuestion[]
    multipleChoiceQuestionFeedback: MultipleChoiceQuestionInterface[]
    singleSelectQuestionFeedback: basicQuestion[]
    matchingTextQuestionsFeedback: FeedbackComponentProps[]
}

export default function ExamFeedbackCard ({
    score,
    overallFeedback,
    freeTextQuestionFeedback,
    multipleChoiceQuestionFeedback,
    singleSelectQuestionFeedback,
    matchingTextQuestionsFeedback
}: ExamFeedbackCardProps) {
    return (
        <div className="flex flex-col gap-4 w-full">
            <Alert
                className="my-4 p-2"
                variant={
                    score >= 10 && score <= 15
                        ? 'warning'
                        : score < 10
                            ? 'destructive'
                            : 'success'
                }
            >
                {score >= 10 && score <= 15 ? (
                    <Check className="w-4 h-4 text-yellow-500" />
                ) : score < 10 ? (
                    <XCircleIcon className="w-4 h-4 text-destructive" />
                ) : (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {score && (
                    <AlertTitle className="text-lg">Your score is {score}</AlertTitle>
                )}
                <AlertDescription>
                    {
                        score >= 10 && score <= 15
                            ? 'You have passed the exam but you can do better. Keep it up!'
                            : score < 10
                                ? 'You have failed the exam. But don\'t worry, you can try again.'
                                : 'Congratulations! You have passed the exam.'
                    }
                </AlertDescription>
            </Alert>

            <Card>
                <CardHeader>
                    <CardTitle>Overall Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{overallFeedback}</p>
                </CardContent>
            </Card>

            {freeTextQuestionFeedback.map((item) => (
                <Card key={item.question}>
                    <CardHeader>
                        <CardTitle>{item.question}</CardTitle>
                        <CardDescription>Free Text Question</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <PencilLineIcon className="w-4 h-4 text-gray-500" />
                            <h4 className="text-lg font-semibold">Your Answer:</h4>
                        </div>
                        <p>{item.answer}</p>
                        <div className="flex items-center gap-2">
                            <CheckIcon className="w-4 h-4 text-green-500" />
                            <h4 className="text-lg font-semibold">Correct Answer:</h4>
                        </div>
                        <p>{item.correctAnswer}</p>
                    </CardContent>
                    <CardFooter className="flex justify-between items-center gap-3">
                        <p>
                            <span className="font-semibold">Feedback:</span>
                            {item.feedback}
                        </p>
                        {item.answer === item.correctAnswer ? (
                            <Badge variant="outline">Correct</Badge>
                        ) : (
                            <Badge variant="destructive">Incorrect</Badge>
                        )}
                    </CardFooter>
                </Card>
            ))}

            <QuizFeedback questions={multipleChoiceQuestionFeedback} />

            {singleSelectQuestionFeedback.map((item) => (
                <Card key={item.question}>
                    <CardHeader>
                        <CardTitle>{item.question}</CardTitle>
                        <CardDescription>Single Select Question</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <PencilLineIcon className="w-4 h-4 text-gray-500" />
                                <h4 className="text-lg font-semibold">Your Answer:</h4>
                                <p>{item.answer}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckIcon className="w-4 h-4 text-green-500" />
                                <h4 className="text-lg font-semibold">Correct Answer:</h4>
                                <p>{item.correctAnswer}</p>
                            </div>
                        </CardContent>
                    </CardContent>
                    <CardFooter className="flex justify-between items-center gap-3">
                        <p>
                            <span className="font-semibold">Feedback:</span>
                            {item.feedback}
                        </p>
                        {item.answer === item.correctAnswer ? (
                            <Badge variant="outline">Correct</Badge>
                        ) : (
                            <Badge variant="destructive">Incorrect</Badge>
                        )}
                    </CardFooter>
                </Card>
            ))}

            {matchingTextQuestionsFeedback.map((item, index) => (
                <FeedbackComponent key={index} question={item} />
            ))}
        </div>
    )
}
