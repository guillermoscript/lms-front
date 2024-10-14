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
export default function ExamPrepSetup () {
    const t = useScopedI18n('ExamPrepSetup')

    return (
        <TourProvider
            steps={[
                {
                    selector: '#message-templates',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('messageTemplates')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('messageTemplatesDescription')}
                            </p>
                        </>
                    )

                },
                {
                    selector: '#form-exam-create-template',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('createExamFormTemplate')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('createExamFormTemplateDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#exam-suggestions-template',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('examSuggestionsTemplate')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('examSuggestionsTemplateDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#suggestions-container',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('suggestions')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('suggestionsDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '.editor',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('chatWithAI')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('chatWithAIDescription')}
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
    const t = useScopedI18n('ExamPrepSetup')

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Button onClick={() => setIsOpen(true)}>
                        {t('guidedTutorial')}
                        <InfoIcon
                            className='ml-2'
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
