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
export default function StudentOnBoarding () {
    const t = useScopedI18n('StudentOnBoarding')

    return (
        <TourProvider
            steps={[
                {
                    selector: '#home',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('welcomeHome')}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                {t('homeDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#account',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('manageAccount')}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                {t('accountDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#chat',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('chatWithAI')}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                {t('chatDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#notifications',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('checkNotifications')}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                {t('notificationsDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#dark-theme-toggle',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('toggleDarkTheme')}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                {t('darkThemeDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#profile',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('viewProfile')}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                {t('profileDescription')}
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

            badgeContent={({ currentStep }) => {
                return ''
            }}
        >
            <StudentOnBoardingButton />
        </TourProvider>
    )
}

function StudentOnBoardingButton () {
    const { setIsOpen } = useTour()
    const t = useScopedI18n('StudentOnBoarding')

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        className="hidden md:block"
                        onClick={() => setIsOpen(true)}
                    >
                        <InfoIcon size={24} />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>
                        {t('takeTour')}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
