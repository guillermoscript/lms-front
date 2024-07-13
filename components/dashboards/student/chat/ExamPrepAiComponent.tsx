'use client'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { AI } from '@/actions/dashboard/AI/ExamPreparationActions'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { FreeTextQuestion, MultipleChoiceQuestion as typeMultipleChoiceQuestion, SingleSelectQuestion as typeSingleSelectQuestion } from '@/utils/types'

import ChatLoadingSkeleton from './ChatLoadingSkeleton'
import FreeTextQuestionComponent from './exam-prep/FreeTextQuestionComponent'
import MatchingTextQuestionComponent, { MatchingTextQuestion } from './exam-prep/MatchingTextQuestionComponent'
import MultipleChoiceQuestionComponent from './exam-prep/MultipleChoiceQuestionComponent'
import TrueFalseQuestion from './exam-prep/TrueFalseQuestion'

export default function ExamPrepAiComponent ({
    singleSelectQuestions,
    freeTextQuestions,
    multipleChoiceQuestions,
    matchingTextQuestions,
    hideSubmit
}: {
    singleSelectQuestions: typeSingleSelectQuestion[]
    freeTextQuestions: FreeTextQuestion[]
    multipleChoiceQuestions: typeMultipleChoiceQuestion[]
    matchingTextQuestions?: MatchingTextQuestion[]
    hideSubmit?: boolean
}) {
    const form = useForm()
    const isLoading = form.formState.isSubmitting
    const { continueConversation } = useActions()
    const [_, setMessages] = useUIState<typeof AI>()
    const [isFinished, setIsFinished] = useState<boolean>(hideSubmit || false)

    async function onSubmit (data: any) {
        const submission: Record<string, any> = {}

        console.log('data', data)

        // Single Select Questions
        singleSelectQuestions.forEach(question => {
            if (data[question.id]) {
                submission[question.id] = {
                    question: question.text,
                    type: 'Single Select',
                    answer: data[question.id]
                }
            }
        })

        // Free Text Questions
        freeTextQuestions.forEach(question => {
            if (data[question.id]) {
                submission[question.id] = {
                    question: question.label,
                    type: 'Free Text',
                    answer: data[question.id]
                }
            }
        })

        // Multiple Choice Questions
        multipleChoiceQuestions.forEach(question => {
            const selectedOptions = data[question.id] || []
            if (selectedOptions.length > 0) {
                submission[question.id] = {
                    question: question.label,
                    type: 'Multiple Choice',
                    answers: selectedOptions.map((optionId: string) => {
                        const option = question.options.find(opt => opt.id === optionId)
                        return option ? option.text : 'Unknown Option'
                    }).join(', ')
                }
            }
        })

        // Matching Text Questions
        matchingTextQuestions?.forEach(question => {
            const answers: Record<string, string> = {}
            const correctAnswers: Record<string, string> = {}
            question.leftColumn.forEach(leftItem => {
                const rightItem = question.rightColumn.find(item => item.id === data[leftItem.id])
                if (rightItem) {
                    answers[leftItem.text] = rightItem.text
                    correctAnswers[leftItem.text] = question.rightColumn.find(item => item.matchedWith === leftItem.id)?.text || ''
                }
            })
            submission[question.id] = {
                question: question.id,
                type: 'Matching Text',
                userAnswers: answers,
                correctAnswers
            }
        })

        console.log(submission)

        const content = `The student answered the following questions:

    ${Object.values(submission)
        .map((item) => {
            if (item.type === 'Matching Text') {
                return `
        Question Type: Matching Text
        Question ID: ${item.question}
        User Answers: ${JSON.stringify(item.userAnswers, null, 2)}
        Correct Answers: ${JSON.stringify(item.correctAnswers, null, 2)}
        `
            } else if (item.type === 'Multiple Choice') {
                return `
        Question Type: Multiple Choice
        Question: ${item.question}
        User Answers: ${JSON.stringify(item.answers, null, 2)}
        `
            } else {
                return `
        Question Type: ${item.type}
        Question: ${item.question}
        User Answer: ${item.answer}
        `
            }
        })
        .join('')}.
        This is the object of the user submission: ${JSON.stringify(submission, null, 2)}

        [showExamResult, please call the function \`showExamResult\` with the user submission object as the argument.]
        `

        console.log(content)

        try {
            const { display } = await continueConversation(content)

            setMessages((messages) => {
                console.log('messages', messages)
                return [...messages, {
                    id: generateId(),
                    display
                }]
            })
            setIsFinished(true)
            console.log(content)
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 my-4">
                    {singleSelectQuestions.length > 0 && singleSelectQuestions.map(question => {
                        return <TrueFalseQuestion key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {freeTextQuestions.length > 0 && freeTextQuestions.map(question => {
                        return <FreeTextQuestionComponent key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {multipleChoiceQuestions.length > 0 && multipleChoiceQuestions.map(question => {
                        return <MultipleChoiceQuestionComponent key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {matchingTextQuestions?.length > 0 && matchingTextQuestions.map(question => {
                        return <MatchingTextQuestionComponent key={question.id} question={question} isFinished={isFinished} form={form} />
                    })}

                    {
                        !isFinished && (
                            <Button disabled={form.formState.isSubmitting} variant='secondary' type="submit">
                                {isLoading ? 'Submitting...' : 'Submit'}
                            </Button>
                        )
                    }

                    {isLoading && (
                        <ChatLoadingSkeleton />
                    )}
                </form>
            </Form>
        </>
    )
}
