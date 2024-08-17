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
export default function StudentOnBoarding () {
    return (
        <TourProvider
            steps={[
                {
                    selector: '#home',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                Welcome to the Home Page
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                This is the starting point of your journey. Here you can find
                the latest updates and navigate to other sections.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#account',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                Manage Your Account
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                In this section, you can update your personal information,
                change your password, and manage your account settings.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#chat',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                Chat with Our AI
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                Use the chat feature to interact with our AI. You can ask for practices for your exam or just chat about anything.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#notifications',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                Check Notifications
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                Stay updated with the latest notifications. Here you will find
                alerts about new messages, updates, and other important
                information.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#dark-theme-toggle',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                Toggle Dark Theme
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                Switch between light and dark themes to suit your preference.
                This can help reduce eye strain in low-light conditions.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#profile',
                    content: (
                        <>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                View Your Profile
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                Access your profile to see your activity, update your profile
                picture, and manage your personal information.
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
            <StudentOnBoardingButton />
        </TourProvider>
    )
}

function StudentOnBoardingButton () {
    const { setIsOpen } = useTour()

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
            Take a tour of the dashboard
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
