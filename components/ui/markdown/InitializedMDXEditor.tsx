'use client'
// InitializedMDXEditor.tsx
import '@mdxeditor/editor/style.css'

import {
    CodeBlockEditorDescriptor,
    MDXEditorMethods,
    MDXEditorProps
} from '@mdxeditor/editor'
import type { ForwardedRef } from 'react'

const {
    MDXEditor,
    codeBlockPlugin,
    headingsPlugin,
    listsPlugin,
    linkPlugin,
    quotePlugin,
    markdownShortcutPlugin,
    toolbarPlugin,
    useCodeBlockEditorContext,
    tablePlugin,
    BlockTypeSelect,
    BoldItalicUnderlineToggles,
    linkDialogPlugin,
    CreateLink,
    ListsToggle,
    UndoRedo,
    InsertTable,
    Separator
} = await import('@mdxeditor/editor')

const PlainTextCodeEditorDescriptor: CodeBlockEditorDescriptor = {
    match: () => true,
    priority: 0,
    Editor: (props) => {
        const cb = useCodeBlockEditorContext()
        return (
            <div onKeyDown={(e) => e.nativeEvent.stopImmediatePropagation()}>
                <textarea
                    rows={3}
                    cols={20}
                    defaultValue={props.code}
                    onChange={(e) => cb.setCode(e.target.value)}
                />
            </div>
        )
    }
}

// Only import this to the next file
export default function InitializedMDXEditor ({
    editorRef,
    ...props
}: { editorRef: ForwardedRef<MDXEditorMethods> | null } & MDXEditorProps) {
    return (
        <MDXEditor
            plugins={[
			  codeBlockPlugin({
			    codeBlockEditorDescriptors: [PlainTextCodeEditorDescriptor]
                }),
			  headingsPlugin(),
			  listsPlugin(),
			  linkPlugin(),
			  quotePlugin(),
			  linkDialogPlugin(),
			  tablePlugin(),
			  markdownShortcutPlugin(),
			  toolbarPlugin({
			    toolbarContents: () => (
                        <>
                            <BlockTypeSelect />
                            <BoldItalicUnderlineToggles />
                            <Separator />
                            <CreateLink />
                            <Separator />
                            <ListsToggle />
                            <Separator />
                            <UndoRedo />
                            <Separator />
                            <InsertTable />
                        </>
			    )
			  })
            ]}
            {...props}
            ref={editorRef}
        />
    )
}
