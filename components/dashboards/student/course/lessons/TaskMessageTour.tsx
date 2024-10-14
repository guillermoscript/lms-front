'use client'

import { TourProvider, useTour } from '@reactour/tour'
import { InfoIcon } from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip'

// Setup component with a button to start the tour
export default function TaskMessageTour () {
    const t = useScopedI18n('TaskMessageTour')

    return (
        <TourProvider
            steps={[
                {
                    selector: '#ai-task-card',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('welcome')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('welcomeDescription')}
                            </p>
                        </>
                    )

                },
                {
                    selector: '#task-status',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('taskStatus')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('taskStatusDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#task-instructions',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('taskInstructions')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('taskInstructionsDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#task-messages',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('messages')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('messagesDescription')}
                            </p>
                        </>

                    )
                },
                {
                    selector: '#tabs-list',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('selectInputType')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('selectInputTypeDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#simple-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('simpleTextInput')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('simpleTextInputDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#markdown-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('markdownTextInput')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('markdownTextInputDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#send-button',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('sendButton')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('sendButtonDescription')}
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
    const t = useScopedI18n('TaskMessageTour')

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
                        {t('guidedTutorialDescription')}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
