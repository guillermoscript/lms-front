import { getScopedI18n } from '@/app/locales/server'
import { Badge } from '@/components/ui/badge'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'

export default async function AiReview({ aiData }) {
    const t = await getScopedI18n('AiReview')
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('title')}</CardTitle>
                <CardDescription>{t('description')}</CardDescription>
            </CardHeader>
            <CardContent>
                {aiData ? (
                    aiData?.userSubmission?.map((submission: any) => {
                        return (
                            <div
                                className="p-4 space-y-4"
                                key={submission.question}
                            >
                                <h4 className="text-2xl font-semibold mb-2">
                                    Question: {submission.question}
                                </h4>
                                <p className="text-gray-500 dark:text-gray-400">
                                    <Badge variant="outline">Answer</Badge>:{' '}
                                    {submission.userAnswer}
                                </p>
                                <p className="font-medium text-gray-500 dark:text-gray-400">
                                    AI review 🤖: {submission.review}
                                </p>
                            </div>
                        )
                    })
                ) : (
                    <p>{t('noReviews')}</p>
                )}
            </CardContent>
            <CardFooter className="flex flex-col gap-4 items-start">
                <h3 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                    {t('overallFeedback')}
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                    {aiData?.overallFeedback}
                </p>
            </CardFooter>
        </Card>
    )
}
