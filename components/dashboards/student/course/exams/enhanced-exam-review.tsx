'use client'
import { AnimatePresence, motion } from 'framer-motion'
import {
    AlertCircle,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Clock,
    User,
    XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ExamReviewProps {
    examData: any
    aiData: any
    examIsReviewed: boolean
}

const QuestionCard = ({ question, answer, examIsReviewed }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const t = useScopedI18n('ExamReview')

    const isCorrect = examIsReviewed && answer.is_correct

    const renderAnswerOption = (optionText, isSelected, isCorrect) => {
        let bgColor = 'bg-gray-100 dark:bg-gray-800'
        let icon = null

        if (isSelected && isCorrect) {
            bgColor = 'bg-green-100 dark:bg-green-800'
            icon = (
                <CheckCircle className="h-5 w-5 text-green-500 mr-2 dark:text-green-400" />
            )
        } else if (isSelected && !isCorrect) {
            bgColor = 'bg-red-100 dark:bg-red-800'
            icon = (
                <XCircle className="h-5 w-5 text-red-500 mr-2 dark:text-red-400" />
            )
        } else if (!isSelected && isCorrect) {
            bgColor = 'bg-blue-100 dark:bg-blue-800'
            icon = (
                <AlertCircle className="h-5 w-5 text-blue-500 mr-2 dark:text-blue-400" />
            )
        }

        return (
            <div className={`flex items-center p-2 rounded-md ${bgColor} mb-2`}>
                {icon}
                {question.question_type === 'free_text' && (
                    <Badge variant="outline" className="ml-auto">
                        {t('yourAnswer')}
                    </Badge>
                )}
                <span>{optionText}</span>

                {isSelected && question.question_type === 'multiple_choice' && (
                    <>
                        <Badge variant="outline" className="ml-auto">
                            {t('yourAnswer')}
                        </Badge>
                    </>
                )}
            </div>
        )
    }

    return (
        <Card className="mb-4">
            <CardHeader
                className={'cursor-pointer '}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                        {examIsReviewed ? (
                            isCorrect ? (
                                <CheckCircle className="inline mr-2 text-green-500" />
                            ) : (
                                <XCircle className="inline mr-2 text-red-500" />
                            )
                        ) : (
                            <Clock className="inline mr-2 text-yellow-500" />
                        )}
                        {question.question_text}
                    </CardTitle>
                    {isExpanded ? <ChevronDown /> : <ChevronRight />}
                </div>
            </CardHeader>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <CardContent className="pt-4">
                            {question.question_type === 'multiple_choice' && (
                                <>
                                    <p className="font-semibold mb-2">
                                        {t('options')}:
                                    </p>
                                    {question.question_options.map((option) => {
                                        const isSelected =
                                            answer.answer_text ===
                                            option.option_id.toString()
                                        return renderAnswerOption(
                                            option.option_text,
                                            isSelected,
                                            option.is_correct
                                        )
                                    })}
                                </>
                            )}
                            {question.question_type === 'true_false' && (
                                <>
                                    <p className="font-semibold mb-2">
                                        {t('yourAnswer')}:
                                    </p>
                                    {renderAnswerOption(
                                        answer.answer_text,
                                        true,
                                        answer.is_correct
                                    )}
                                    {examIsReviewed && (
                                        <>
                                            <p className="font-semibold mb-2 mt-4">
                                                {t('correctAnswer')}:
                                            </p>
                                            {renderAnswerOption(
                                                question.correct_answer,
                                                false,
                                                true
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                            {question.question_type === 'free_text' && (
                                <>
                                    <p className="font-semibold mb-2">
                                        {t('yourAnswer')}:
                                    </p>
                                    <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md mb-4">
                                        {answer.answer_text}
                                    </p>
                                </>
                            )}
                            {answer.feedback && (
                                <div className="mt-4">
                                    <p className="font-semibold mb-2">
                                        {t('feedback')}:
                                    </p>
                                    <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                                        {answer.feedback}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}

const ExamReview: React.FC<ExamReviewProps> = ({
    examData,
    aiData,
    examIsReviewed,
}) => {
    const t = useScopedI18n('ExamReview')

    const score = examData.exam_submissions[0]?.exam_scores[0]?.score
    const totalQuestions = examData.exam_questions.length
    const correctAnswers = examIsReviewed
        ? examData.exam_submissions[0]?.exam_answers.filter((a) => a.is_correct)
              .length
        : 0

    return (
        <div className="container mx-auto px-4 py-8">
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
                            {correctAnswers} {t('outOf')} {totalQuestions}{' '}
                            {t('correct')}
                        </p>
                    </CardContent>
                )}
            </Card>

            <Tabs defaultValue="questions">
                <TabsList className="mb-4">
                    <TabsTrigger value="questions">
                        {t('questions')}
                    </TabsTrigger>
                    <TabsTrigger value="aiReview">{t('aiReview')}</TabsTrigger>
                </TabsList>
                <TabsContent value="questions">
                    {examData?.exam_questions?.map((question, index) => (
                        <QuestionCard
                            key={question.question_id}
                            question={question}
                            answer={examData.exam_submissions[0].exam_answers.find(
                                (a) => a.question_id === question.question_id
                            )}
                            examIsReviewed={examIsReviewed}
                        />
                    ))}
                </TabsContent>
                <TabsContent value="aiReview">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('aiReviewTitle')}</CardTitle>
                            <CardDescription>
                                {t('aiReviewDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {aiData?.userSubmission?.map(
                                (submission, index) => (
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
                                )
                            )}
                        </CardContent>
                        <CardFooter>
                            <h3 className="font-semibold text-lg mb-2">
                                {t('overallFeedback')}
                            </h3>
                            <p>{aiData?.overallFeedback}</p>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default ExamReview
