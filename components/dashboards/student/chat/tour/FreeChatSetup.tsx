'use client'

import { TourProvider, useTour } from '@reactour/tour'
import { InfoIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

// Setup component with a button to start the tour
export default function FreeChatSetup () {
    return (
        <TourProvider
            steps={[
                {
                    selector: '#free_chat',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">Free Chat</h4>

                            <p className="text-gray-600 dark:text-gray-300">
    This part of the sidebar si where you can create and view all of your free chat messages.
                            </p>
                        </>
                    )

                },
                {
                    selector: '#exam_prep',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">Exam Preparation</h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This part is when you can create and view all of your exam preparation messages.
                                This is a different chat type from the free chat. focused on exam preparation.
                            </p>
                        </>
                    )

                },
                {
                    selector: '#quiz-me',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">Quiz Me</h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can prepare for your exams, the AI will create Forms for you to fill out and get feedback on your answers.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#suggestions-container',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">Suggestions</h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can view the suggestions from the AI. to chat about with the AI.
                            </p>
                        </>

                    )
                },
                {
                    selector: '.editor',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">Chat with the AI assistant</h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can chat with the AI assistant. You can ask questions, get suggestions, and more.
                            </p>
                        </>
                    )
                }
            ]}
            onClickMask={({ setCurrentStep, currentStep, steps, setIsOpen }) => {
                if (steps) {
                    if (currentStep === steps.length - 1) {
                        setIsOpen(false)
                    }
                    setCurrentStep((s) => (s === steps.length - 1 ? 0 : s + 1))
                }
            }}
        >
            <ChatTourFreeChat />
        </TourProvider>
    )
}

function ChatTourFreeChat () {
    const { setIsOpen } = useTour()

    return (
        <div className="demo">
            <Button onClick={() => setIsOpen(true)}>
                <InfoIcon size={24} />
            </Button>
        </div>
    )
}
