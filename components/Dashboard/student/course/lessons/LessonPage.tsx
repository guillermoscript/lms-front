'use client'
import { useMediaQuery } from 'usehooks-ts'

import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from '@/components/ui/resizable'
export default function LessonPage ({
    children,
    sideBar
}: {
    children: React.ReactNode
    sideBar: React.ReactNode
}) {
    const matches = useMediaQuery('(min-width: 768px)')

    if (matches) {
        return (
            <ResizablePanelGroup direction="horizontal">
                <ResizablePanel defaultSize={75} className="p-4">
                    {children}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel
                    defaultSize={25}
                    className="bg-gray-50 dark:bg-gray-800 p-4 overflow-y-auto rounded"
                >
                    {sideBar}
                </ResizablePanel>
            </ResizablePanelGroup>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {children}
            {sideBar}
        </div>
    )
}
