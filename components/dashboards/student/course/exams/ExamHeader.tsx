import { User } from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

const ExamHeader = ({ examData, examIsReviewed, score, totalQuestions, correctAnswers }) => {
    const t = useScopedI18n('ExamReview')

    return (
        <Card className="mb-8">
            <CardHeader>
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <div className="flex flex-col gap-4">
                        <CardTitle className="text-2xl">
                            {examData.title} {t('review')}
                        </CardTitle>
                        <CardDescription>
                            <User className="inline mr-2" />
                            {t('teacher')}:{' '}
                            {examData.teacher_name || t('notSpecified')}
                        </CardDescription>
                    </div>
                    <Badge className="text-xl p-2">
                        {examIsReviewed
                            ? `${t('score')}: ${score}/${totalQuestions}`
                            : t('waitingForReview')}
                    </Badge>
                </div>
            </CardHeader>
            {examIsReviewed && (
                <CardContent>
                    <Progress
                        value={(correctAnswers / totalQuestions) * 100}
                        className="h-2 mb-2"
                    />
                    <p className="text-sm text-center">
                        {t('correct')}{' '}
                        {correctAnswers}
                    </p>
                    <p className="text-sm text-center">
                        {t('totalQuestions')}: {totalQuestions}
                    </p>
                </CardContent>
            )}
        </Card>
    )
}

export default ExamHeader
