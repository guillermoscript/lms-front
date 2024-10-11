'use client'
import axios from 'axios'
import { useEffect, useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import AIReview from './AIReview'
import ExamHeader from './ExamHeader'
import QuestionCard from './QuestionCard'

interface ExamReviewProps {
    examData: any;
    submissionId: number; // Pass submission ID as a prop
    examIsReviewed: boolean;
    initialAiData: AIData | null;
}

interface AIData {
    userSubmission: Array<{
        question: string;
        review: string;
        userAnswer: string;
    }>;
    overallFeedback: string;
}

const ExamReview: React.FC<ExamReviewProps> = ({
    examData,
    submissionId,
    examIsReviewed,
    initialAiData,
}) => {
    const [aiData, setAiData] = useState<AIData | null>(initialAiData)
    const [aiLoading, setAiLoading] = useState<boolean>(false)
    const [polling, setPolling] = useState<boolean>(false)

    const score = examData.exam_submissions[0]?.exam_scores[0]?.score
    const totalQuestions = examData.exam_questions.length
    const correctAnswers = examIsReviewed
        ? examData.exam_submissions[0]?.exam_answers.filter(
            (a) => a.is_correct
        ).length
        : 0

    useEffect(() => {
        if (!submissionId || !examData || aiData) return

        // Function to fetch AI data
        const fetchAIData = async () => {
            try {
                const res = await axios.get(`/api/exams/${submissionId}/ai-data`)
                if (res.data.ai_data) {
                    setAiData(res.data.ai_data)
                    setAiLoading(false)
                    setPolling(false)
                } else {
                    // If AI data not ready, continue polling
                    setTimeout(fetchAIData, 5000) // Poll every 5 seconds
                }
            } catch (error) {
                console.error('Error fetching AI data:', error)
                setAiLoading(false)
                setPolling(false)
            }
        }

        // Start polling if AI data is not yet available
        const initiatePolling = () => {
            setAiLoading(true)
            setPolling(true)
            fetchAIData()
        }

        // Check immediately if AI data is available
        const checkAIData = async () => {
            try {
                const res = await axios.get(`/api/exams/${submissionId}/ai-data`)
                if (res.data.ai_data) {
                    setAiData(res.data.ai_data)
                    setAiLoading(false)
                    setPolling(false)
                } else {
                    // If AI data not ready, start polling
                    initiatePolling()
                }
            } catch (error) {
                console.error('Error checking AI data:', error)
                setAiLoading(false)
                setPolling(false)
            }
        }

        checkAIData()

        return () => {
            setAiData(null)
            setAiLoading(false)
            setPolling(false)
        }
    }, [submissionId])

    return (
        <div className="container mx-auto px-4 py-8">
            <ExamHeader
                examData={examData}
                examIsReviewed={examIsReviewed}
                score={score}
                totalQuestions={totalQuestions}
                correctAnswers={correctAnswers}
            />
            <Tabs defaultValue="questions">
                <TabsList className="mb-4">
                    <TabsTrigger value="questions">
                        Questions
                    </TabsTrigger>
                    <TabsTrigger value="aiReview">
                        AI Review
                    </TabsTrigger>
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
                    <AIReview aiData={aiData} aiLoading={aiLoading} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default ExamReview
