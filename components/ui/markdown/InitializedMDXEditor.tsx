'use client'
// InitializedMDXEditor.tsx
import '@mdxeditor/editor/style.css'

import {
    ChangeCodeMirrorLanguage,
    codeMirrorPlugin,
    ConditionalContents,
    InsertCodeBlock,
    InsertSandpack,
    MDXEditorMethods,
    MDXEditorProps,
    SandpackConfig,
    sandpackPlugin,
    ShowSandpackInfo
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

const defaultSnippetContent = `
export default function App() {
  return (
    <div className="App">
      <h1>Hello CodeSandbox</h1>
      <h2>Start editing to see some magic happen!</h2>
    </div>
  );
}
`.trim()

const simpleSandpackConfig: SandpackConfig = {
    defaultPreset: 'react',
    presets: [
        {
            label: 'React',
            name: 'react',
            meta: 'live react',
            sandpackTemplate: 'react',
            sandpackTheme: 'light',
            snippetFileName: '/App.js',
            snippetLanguage: 'jsx',
            initialSnippetContent: defaultSnippetContent
        }
    ]
}

// Only import this to the next file
export default function InitializedMDXEditor ({
    editorRef,
    ...props
}: { editorRef: ForwardedRef<MDXEditorMethods> | null } & MDXEditorProps) {
    return (
        <MDXEditor
            plugins={[
                // the default code block language to insert when the user clicks the "insert code block" button
                codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }),
                sandpackPlugin({ sandpackConfig: simpleSandpackConfig }),
                codeMirrorPlugin({
                    codeBlockLanguages: { js: 'JavaScript', css: 'CSS', html: 'HTML', python: 'Python', java: 'Java' }
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
                        <div
                            className='flex gap-2 flex-wrap items-center justify-center w-full'
                        >
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
                            <ConditionalContents
                                options={[
                                    {
                                        when: (editor) => editor?.editorType === 'codeblock',
                                        contents: () => <ChangeCodeMirrorLanguage />
                                    },
                                    {
                                        when: (editor) => editor?.editorType === 'sandpack',
                                        contents: () => <ShowSandpackInfo />
                                    },
                                    {
                                        fallback: () => (
                                            <>
                                                <InsertCodeBlock />
                                                <InsertSandpack />
                                            </>
                                        )
                                    }
                                ]}
                            />
                        </div>
                    )
                })
            ]}
            {...props}
            ref={editorRef}
        />
    )
}
