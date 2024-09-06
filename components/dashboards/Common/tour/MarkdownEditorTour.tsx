import { TourProvider, useTour } from '@reactour/tour'
import { InfoIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip'

export default function MarkdownEditorTour() {
    return (
        <TourProvider
            steps={[
                {
                    selector: '#tabs-list',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                Welcome to guide on how to use the text editor
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can find a guided tutorial to help you work with the rich text editor.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#simple-tab',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the tab for simple text
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can click this tab to write simple text.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#simple-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the content area for simple text
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can write simple text. it does not support markdown rendering. its just plain text.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#markdown-tab',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the tab for markdown text
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can click this tab to write markdown text. it supports markdown rendering.
                            </p>
                            <p className='font-bold text-red-500'>
                                Please click the tab to continue the tutorial
                            </p>
                        </>
                    )
                },
                {
                    selector: '#markdown-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the content area for markdown text
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can select this tab to write markdown text. it supports markdown rendering. it also has multiple options to format your text. Like code blocks, lists, and more. lets explore it
                            </p>
                        </>
                    )
                },
                {
                    selector: '#markdown-content',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the content area for markdown text
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can select this tab to write markdown text. it supports markdown rendering. it also has multiple options to format your text. Like code blocks, lists, and more. lets explore it
                            </p>
                        </>
                    )
                },
                {
                    selector: '#blockTypeSelect',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the block type select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can select the block type. like paragraph, heading, code block, and more.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#BoldSelect',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the bold, italic, underline select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can select the bold, italic, underline options to format your text.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#creatLink',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the create link select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can create a link in your text.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#ListToggle',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the list toggle select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can select the list toggle to create lists in your text.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#UndoRedo',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the undo redo select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can undo or redo your text changes.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#InsertTable',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the insert table select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can insert a table in your text.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#InsertCodeBlock',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the simpleCodeBlock select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can insert a code block in your text. Like python, javascript, and more. this will have automatic syntax highlighting, line numbers, and more.
                                Please use this when you want to insert code in your text.
                            </p>
                        </>
                    )
                },
                {
                    selector: '#InsertSandPack',
                    content: (
                        <>
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-400">
                                This is the SandPack select
                            </h4>

                            <p className="text-gray-600 dark:text-gray-300">
                                Here you can insert code blocks that renders a live code editor. with a live preview. This means that you can write code and see the output in real-time.
                                like a code playground with real code execution. it supports javascript, typescript, react, and more.
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
            <MarkdowinEditorTourButton />
        </TourProvider>
    )
}

function MarkdowinEditorTourButton () {
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
                        Here you can find a guided tutorial to help you work with the rich text editor.
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
