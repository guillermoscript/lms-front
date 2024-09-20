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
export default function FreeChatSetup () {
    const t = useScopedI18n('FreeChatSetup')

    return (
        <TourProvider
            steps={[
                {
                    selector: '#free_chat',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('freeChat.title')}
                            </h4>
                            <p className="text-gray-600 dark:text-gray-300">
                                {t('freeChat.description')}
                            </p>
                        </>
                    )

                },
                {
                    selector: '#exam_prep',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('examPrep.title')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('examPrep.description')}
                            </p>
                        </>
                    )

                },
                {
                    selector: '#quiz-me',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('quizMe.title')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('quizMe.description')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#suggestions-container',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('suggestions.title')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('suggestions.description')}
                            </p>
                        </>

                    )
                },
                {
                    selector: '.editor',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('editor.title')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('editor.description')}
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
    const t = useScopedI18n('FreeChatSetup')

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        className='w-fit'
                        onClick={() => setIsOpen(true)}
                    >
                        {t('title')}
                        <InfoIcon
                            className='ml-2'
                            size={24}
                        />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>
                        {t('description')}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
