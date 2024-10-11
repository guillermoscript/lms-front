import { AnimatePresence, motion } from 'framer-motion'
import {
    AlertCircle,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Clock,
    XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const QuestionCard = ({ question, answer, examIsReviewed }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const t = useScopedI18n('ExamReview')
    const isCorrect = examIsReviewed && answer.is_correct

    const renderAnswerOption = (optionText, isSelected, isCorrectOption) => {
        let bgColor = 'bg-gray-100 dark:bg-gray-800'
        let icon = null

        if (isSelected && isCorrectOption) {
            bgColor = 'bg-green-100 dark:bg-green-800'
            icon = (
                <CheckCircle className="h-5 w-5 text-green-500 mr-2 dark:text-green-400" />
            )
        } else if (isSelected && !isCorrectOption) {
            bgColor = 'bg-red-100 dark:bg-red-800'
            icon = (
                <XCircle className="h-5 w-5 text-red-500 mr-2 dark:text-red-400" />
            )
        } else if (!isSelected && isCorrectOption) {
            bgColor = 'bg-blue-100 dark:bg-blue-800'
            icon = (
                <AlertCircle className="h-5 w-5 text-blue-500 mr-2 dark:text-blue-400" />
            )
        }

        return (
            <div
                className={`flex items-center p-2 rounded-md ${bgColor} mb-2`}
                key={optionText}
            >
                {icon}
                {question.question_type === 'free_text' && (
                    <Badge variant="outline" className="ml-auto">
                        {t('yourAnswer')}
                    </Badge>
                )}
                <span>{optionText}</span>
                {isSelected && question.question_type === 'multiple_choice' && (
                    <Badge variant="outline" className="ml-auto">
                        {t('yourAnswer')}
                    </Badge>
                )}
            </div>
        )
    }

    console.log(question)

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
                            <QuestionContent
                                question={question}
                                answer={answer}
                                t={t}
                                renderAnswerOption={renderAnswerOption}
                            />
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}

export default QuestionCard

interface QuestionContentProps {
    question: any
    answer: any
    t: (key: string) => string
    renderAnswerOption: (text: string, isSelected: boolean, isCorrect: boolean) => JSX.Element
}

const QuestionContent: React.FC<QuestionContentProps> = ({ question, answer, t, renderAnswerOption }) => {
    // if no answer is provided, show a message that no answer was provided

    if (!answer) {
        return (
            <p className="text-gray-500">
                {t('noAnswer')}
            </p>
        )
    }

    if (question.question_type === 'multiple_choice') {
        return (
            <>
                <p className="font-semibold mb-2">
                    {t('options')}:
                </p>
                {question?.question_options?.map((option) => {
                    const isSelected = answer.answer_text === option.option_id.toString()
                    return answer ? (
                        renderAnswerOption(option.option_text, isSelected, option.is_correct)
                    ) : (
                        <div key={option.option_id} className="flex items-center p-2 rounded-md bg-gray-100 dark:bg-gray-800 mb-2">
                            <span>{option.option_text}</span>
                            <Badge variant="outline" className="ml-auto">
                                {t('correctAnswer')}
                            </Badge>
                        </div>
                    )
                })}
            </>
        )
    }

    if (question.question_type === 'true_false') {
        return (
            <>
                <p className="font-semibold mb-2">
                    {t('yourAnswer')}:
                </p>
                {answer ? (
                    renderAnswerOption(answer.answer_text, true, answer.is_correct)
                ) : (
                    <p className="text-gray-500">
                        {t('noAnswer')}
                    </p>
                )}
            </>
        )
    }

    if (question.question_type === 'free_text') {
        return answer?.answer_text ? (
            <>
                <p className="font-semibold mb-2">
                    {t('yourAnswer')}:
                </p>
                <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md mb-4">
                    {answer.answer_text}
                </p>
            </>
        ) : (
            <p className="text-gray-500">
                {t('noAnswer')}
            </p>
        )
    }

    return null
}
