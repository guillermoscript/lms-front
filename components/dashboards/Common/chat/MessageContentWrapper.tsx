/* eslint-disable @typescript-eslint/promise-function-async */
'use client'
import React, { cloneElement, ReactNode, useState } from 'react'

import MessageFeaturesSection from '@/components/dashboards/Common/chat/MessageFeaturesSection'

interface MessageContentWrapperProps {
    view: ReactNode
    edit: ReactNode
    regenerate?: ReactNode
    role: 'assistant' | 'user'
}

export type ViewMode = 'view' | 'edit' | 'regenerate'

export default function MessageContentWrapper({
    view,
    edit,
    regenerate,
    role
}: MessageContentWrapperProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('view')

    console.log(viewMode)
    
    let clonedElement;
    switch (viewMode) {
        case 'view':
            clonedElement = cloneElement(React.isValidElement(view) ? view : <></>, { setViewMode, viewMode });
            break;
        case 'edit':
            clonedElement = cloneElement(React.isValidElement(edit) ? edit : <></>, { setViewMode, viewMode });
            break;
        case 'regenerate':
            clonedElement = cloneElement(React.isValidElement(regenerate) ? regenerate : <></>, { setViewMode, viewMode });
            break;
        default:
            clonedElement = <></>;
    }

    
    return (
        <>
            {clonedElement}
            <MessageFeaturesSection
                setViewMode={setViewMode}
                viewMode={viewMode}
                role={role}
            />
        </>
    )
}
