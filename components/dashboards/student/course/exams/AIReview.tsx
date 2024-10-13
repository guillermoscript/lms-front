import { AlertCircle, Loader } from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const AIReview = ({ aiData, aiLoading }) => {
    const t = useScopedI18n('ExamReview')

    if (aiLoading && !aiData) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <Loader className="animate-spin mb-4" size={50} />
                <p className="text-center">
                    {t('aiProcessingMessage')}
                </p>
            </div>
        )
    }

    if (!aiLoading && !aiData) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <AlertCircle className="text-yellow-500 mb-2" size={50} />
                <p className="text-center">
                    {t('aiNotAvailableMessage')}
                </p>
            </div>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('aiReviewTitle')}</CardTitle>
                <CardDescription>
                    {t('aiReviewDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {aiData.userSubmission.map((submission, index) => (
                    <div
                        key={index}
                        className="mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
                    >
                        <h4 className="font-semibold mb-2">
                            {t('question')}:{' '}
                            {submission.question}
                        </h4>
                        <p className="mb-2">
                            <Badge variant="outline">
                                {t('answer')}
                            </Badge>{' '}
                            {submission.userAnswer}
                        </p>
                        <p className="italic">
                            {t('aiReview')}: {submission.review}
                        </p>
                    </div>
                ))}
            </CardContent>
            <CardFooter
                className='flex flex-col items-start gap-4 border-t pt-4'
            >
                <h3 className="font-semibold text-lg mb-2">
                    {t('overallFeedback')}
                </h3>
                <p>{aiData.overallFeedback}</p>
            </CardFooter>
        </Card>
    )
}

export default AIReview
