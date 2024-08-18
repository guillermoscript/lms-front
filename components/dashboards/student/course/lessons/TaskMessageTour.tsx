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
export default function TaskMessageTour () {
    return (
        <TourProvider
            steps={[
                {
                    selector: '#ai-task-card',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Welcome to the AI Task Chat
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
    Here is where you can test what you have learned in the lesson. The AI will be your teacher and will reviw your work, give you feedback, and once you give the correct answer, it will mark the task as completed.
                            </p>
                        </>
                    )

                },
                {
                    selector: '#task-status',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Task Status
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can see the status of the task. If you have completed the task, it will show as completed.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#task-instructions',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Task Instructions
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can see the instructions for the task. Make sure to read them carefully before starting the task.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#task-messages',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Messages
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can see the messages from the AI and your responses.
                            </p>
                        </>

                    )
                },
                {
                    selector: '#tabs-list',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Select the input type
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can select the input type. You can choose between a simple text input and a markdown text input.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#simple-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                A simple text input
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                You can type your response here and send it to the AI. its a simple text input.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#markdown-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Markdown text input
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                You can type your response here and send it to the AI. its a markdown text input. you have multiple options to format your text. Like code blocks, lists, and more.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#send-button',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Send Button
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                This is where you can send your response to the AI. Once you have typed your response, click the send button to send it to the AI.
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
            <TaskMessageTourButton />
        </TourProvider>
    )
}

function TaskMessageTourButton () {
    const { setIsOpen } = useTour()

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>

                    <Button onClick={() => setIsOpen(true)}>

                        <InfoIcon
                            className=''
                            size={24}
                        />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>
                        Here you can find a guided tutorial to help you get started with the AI Task Chat.
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>

    )
}
