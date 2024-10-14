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

export default function MarkdownEditorTour() {
    const t = useScopedI18n('MarkdownEditorTour')

    return (
        <TourProvider
            steps={[
                {
                    selector: '#tabs-list',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('welcomeGuide')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('welcomeGuideDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#simple-tab',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('simpleTab')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('simpleTabDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#simple-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('simpleContent')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('simpleContentDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#markdown-tab',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('markdownTab')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('markdownTabDescription')}
                            </p>
                            <p className='font-bold text-red-500'>
                                {t('clickToContinue')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#markdown-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('markdownContent')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('markdownContentDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#blockTypeSelect',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('blockTypeSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('blockTypeSelectDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#BoldSelect',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('boldItalicUnderlineSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('boldItalicUnderlineSelectDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#creatLink',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('createLinkSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('createLinkSelectDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#ListToggle',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('listToggleSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('listToggleSelectDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#UndoRedo',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('undoRedoSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('undoRedoSelectDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#InsertTable',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('insertTableSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('insertTableSelectDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#InsertCodeBlock',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('insertCodeBlockSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('insertCodeBlockSelectDescription')}
                            </p>
                        </>
                    )
                },
                {
                    selector: '#InsertSandPack',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                {t('insertSandPackSelect')}
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                {t('insertSandPackSelectDescription')}
                            </p>
                        </>
                    )
                },
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
            <MarkdownEditorTourButton />
        </TourProvider>
    )
}

function MarkdownEditorTourButton () {
    const { setIsOpen } = useTour()
    const t = useScopedI18n('MarkdownEditorTour')

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
