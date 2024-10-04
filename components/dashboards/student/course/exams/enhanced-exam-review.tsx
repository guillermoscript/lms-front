'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, ChevronDown, ChevronRight, Clock, User, XCircle } from 'lucide-react'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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

    const isCorrect = examIsReviewed && (
        question.question_type === 'multiple_choice'
            ? answer.is_correct
            : answer.answer_text === question.correct_answer
    )

    const getAnswerText = (answerText) => {
        if (question.question_type === 'multiple_choice') {
            const selectedOptionIds = answerText.split(',')
            return selectedOptionIds.map(id =>
                question.question_options.find(opt => opt.option_id.toString() === id)?.option_text
            ).join(', ')
        }
        return answerText
    }

    const getCorrectAnswerText = () => {
        if (question.question_type === 'multiple_choice') {
            return question.question_options
                .filter(opt => opt.is_correct)
                .map(opt => opt.option_text)
                .join(', ')
        }
        return question.correct_answer
    }

    return (
        <Card className="mb-4">
            <CardHeader
                className={'cursor-pointer'}
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
                            <p className="font-semibold mb-2">{t('yourAnswer')}:</p>
                            <p className="mb-4">{getAnswerText(answer.answer_text)}</p>
                            {examIsReviewed && (
                                <div className="mb-4">
                                    <p className="font-semibold mb-2">{t('correctAnswer')}:</p>
                                    <p>{getCorrectAnswerText()}</p>
                                </div>
                            )}
                            {answer.feedback && (
                                <div>
                                    <p className="font-semibold mb-2">{t('feedback')}:</p>
                                    <p>{answer.feedback}</p>
                                </div>
                            )}
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}

const ExamReview: React.FC<ExamReviewProps> = ({ examData, aiData, examIsReviewed }) => {
    const t = useScopedI18n('ExamReview')

    const score = examData.exam_submissions[0]?.exam_scores[0]?.score
    const totalQuestions = examData.exam_questions.length
    const correctAnswers = examIsReviewed
        ? examData.exam_submissions[0]?.exam_answers.filter(a => a.is_correct).length
        : 0

    return (
        <div className="container mx-auto">
            <Card className="mb-8">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-2xl">{examData.title} {t('review')}</CardTitle>
                            <CardDescription>
                                <User className="inline mr-2" />
                                {t('teacher')}: {examData.teacher_name || t('notSpecified')}
                            </CardDescription>
                        </div>
                        <Badge className="text-xl p-2">
                            {examIsReviewed
                                ? `${t('score')}: ${score}/${totalQuestions}`
                                : t('waitingForReview')
                            }
                        </Badge>
                    </div>
                </CardHeader>
                {examIsReviewed && (
                    <CardContent>
                        <Progress value={(correctAnswers / totalQuestions) * 100} className="h-2 mb-2" />
                        <p className="text-sm text-center">{correctAnswers} {t('outOf')} {totalQuestions} {t('correct')}</p>
                    </CardContent>
                )}
            </Card>

            <Tabs defaultValue="questions">
                <TabsList className="mb-4">
                    <TabsTrigger value="questions">{t('questions')}</TabsTrigger>
                    <TabsTrigger value="aiReview">{t('aiReview')}</TabsTrigger>
                </TabsList>
                <TabsContent value="questions">
                    {examData?.exam_questions?.map((question, index) => (
                        <QuestionCard
                            key={question.question_id}
                            question={question}
                            answer={examData.exam_submissions[0].exam_answers[index]}
                            examIsReviewed={examIsReviewed}
                        />
                    ))}
                </TabsContent>
                <TabsContent value="aiReview">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {t('aiReviewTitle')}
                            </CardTitle>
                            <CardDescription>{t('aiReviewDescription')}</CardDescription>
                        </CardHeader>
                        <CardContent 
                            className='flex flex-col gap-4 items-start'
                        >
                        <h3 className="font-semibold text-lg mb-2">{t('overallFeedback')}</h3>
                        <p>{aiData?.overallFeedback}</p>
                            {aiData?.userSubmission?.map((submission, index) => (
                                <div key={index} className="mb-4 p-4 rounded-lg">
                                    <h4 className="font-semibold mb-2">{t('question')}: {submission.question}</h4>
                                    <p className="mb-2"><Badge variant="outline">{t('answer')}</Badge> {submission.userAnswer}</p>
                                    <p className="italic">{t('aiReview')}: {submission.review}</p>
                                </div>
                            ))}
                        </CardContent>
                        <CardFooter>
                            <p>
                                {t('aiReviewFooter')}
                            </p>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default ExamReview
