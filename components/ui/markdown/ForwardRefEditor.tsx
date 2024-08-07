'use client'

import { MDXEditorMethods, MDXEditorProps } from '@mdxeditor/editor'
import dynamic from 'next/dynamic'
import { forwardRef } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

// ForwardRefEditor.tsx

// This is the only place InitializedMDXEditor is imported directly.
const Editor = dynamic(async () => await import('./InitializedMDXEditor'), {
    // Make sure we turn SSR off
    ssr: false,
    loading: () => (
        <Skeleton className="h-[125px] w-full my-1 rounded-xl" />

    ),
})

// This is what is imported by other components. Pre-initialized with plugins, and ready
// to accept other props, including a ref.
export const ForwardRefEditor = forwardRef<MDXEditorMethods, MDXEditorProps>(
    (props, ref) => <Editor {...props} editorRef={ref} />
)

// TS complains without the following line
ForwardRefEditor.displayName = 'ForwardRefEditor'
