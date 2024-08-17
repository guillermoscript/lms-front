'use client'

import { TourProvider, useTour } from '@reactour/tour'
import { InfoIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip'

// Setup component with a button to start the tour
export default function ExamPrepSetup () {
    return (
        <TourProvider
            steps={[
                {
                    selector: '#message-templates',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Message Templates
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
    This buttons will help you to create a message following a template, for the specific button you will get a basic text with some placeholders to fill out.
                            </p>
                        </>
                    )

                },
                {
                    selector: '#form-exam-create-template',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Create Exam Form Template
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This button will help you to create a basic exam form for the subject you want. For that your will need to fill out the placeholders marked with " ".
                                The AI will improve the form with the information you provide. The more you give the better the form will be.
                                Also keep in mind that the AI will ask you for more information if needed. So be ready to provide it.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#exam-suggestions-template',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Exam Suggestions Template
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This button will help you to ask the AI for suggestions for an exam form for the subject you want. For that your will need to fill out the placeholders marked with " ".
                                The AI will give you some suggestions for the form. You can ask for more suggestions if you want.
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
            <ChatTourExamPrepChat />
        </TourProvider>
    )
}

function ChatTourExamPrepChat () {
    const { setIsOpen } = useTour()

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>

                    <Button onClick={() => setIsOpen(true)}>
                        Guided Tutorial
                        <InfoIcon
                            className='ml-2'
                            size={24}
                        />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>
                        If you want to know more about the exam prep chat, click the button above to start the tour.
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>

    )
}
