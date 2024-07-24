'use client'

import { useMediaQuery } from 'usehooks-ts'

import { Separator } from '@/components/ui/separator'
export default function LessonPage({
    children,
    sideBar,
}: {
    children: React.ReactNode
    sideBar: React.ReactNode
}) {
    const matches = useMediaQuery('(min-width: 768px)')

    if (matches) {
        return (
            <div className="flex flex-row gap-4">
                <div className="w-[75%]">{children}</div>
                <div className="flex-1 border-l">{sideBar}</div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {children}
            <Separator className="my-4" />
            {sideBar}
        </div>
    )
}
