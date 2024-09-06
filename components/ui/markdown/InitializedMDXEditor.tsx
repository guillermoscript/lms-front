'use client'
// InitializedMDXEditor.tsx
import '@mdxeditor/editor/style.css'

import {
    BlockTypeSelect,
    BoldItalicUnderlineToggles,
    ChangeCodeMirrorLanguage,
    codeBlockPlugin,
    codeMirrorPlugin,
    ConditionalContents,
    CreateLink,
    headingsPlugin,
    imagePlugin,
    InsertCodeBlock,
    InsertSandpack,
    InsertTable,
    linkDialogPlugin,
    linkPlugin,
    listsPlugin,
    ListsToggle,
    markdownShortcutPlugin,
    MDXEditor,
    MDXEditorMethods,
    MDXEditorProps,
    quotePlugin,
    SandpackConfig,
    sandpackPlugin,
    Separator,
    ShowSandpackInfo,
    tablePlugin,
    toolbarPlugin,
    UndoRedo,
} from '@mdxeditor/editor'
import type { ForwardedRef } from 'react'

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
            initialSnippetContent: defaultSnippetContent,
        },
        {
            label: 'React (dark)',
            name: 'react-dark',
            meta: 'live react',
            sandpackTemplate: 'react',
            sandpackTheme: 'dark',
            snippetFileName: '/App.js',
            snippetLanguage: 'jsx',
            initialSnippetContent: defaultSnippetContent,
        },
        {
            label: 'Vue',
            name: 'vue',
            meta: 'live vue',
            sandpackTemplate: 'vue',
            sandpackTheme: 'light',
            snippetFileName: '/App.vue',
            snippetLanguage: 'vue',
        },
        {
            label: 'Vue (dark)',
            name: 'vue-dark',
            meta: 'live vue',
            sandpackTemplate: 'vue',
            sandpackTheme: 'dark',
            snippetFileName: '/App.vue',
            snippetLanguage: 'vue',
        },
        {
            label: 'Svelte',
            name: 'svelte',
            meta: 'live svelte',
            sandpackTemplate: 'svelte',
            sandpackTheme: 'light',
            snippetFileName: '/App.svelte',
            snippetLanguage: 'svelte',
        },
        {
            label: 'Svelte (dark)',
            name: 'svelte-dark',
            meta: 'live svelte',
            sandpackTemplate: 'svelte',
            sandpackTheme: 'dark',
            snippetFileName: '/App.svelte',
            snippetLanguage: 'svelte',
        },
        {
            label: 'Vanilla',
            name: 'vanilla',
            meta: 'live vanilla',
            sandpackTemplate: 'vanilla',
            sandpackTheme: 'light',
            snippetFileName: '/index.js',
            snippetLanguage: 'javascript',
        },
        {
            label: 'Vanilla (dark)',
            name: 'vanilla-dark',
            meta: 'live vanilla',
            sandpackTemplate: 'vanilla',
            sandpackTheme: 'dark',
            snippetFileName: '/index.js',
            snippetLanguage: 'javascript',
        },
        {
            label: 'TypeScript',
            name: 'typescript',
            meta: 'live typescript',
            sandpackTemplate: 'vanilla-ts',
            sandpackTheme: 'light',
            snippetFileName: '/index.ts',
            snippetLanguage: 'typescript',
        },
        {
            label: 'TypeScript (dark)',
            name: 'typescript-dark',
            meta: 'live typescript',
            sandpackTemplate: 'vanilla-ts',
            sandpackTheme: 'dark',
            snippetFileName: '/index.ts',
            snippetLanguage: 'typescript',
        },
        {
            label: 'JavaScript',
            name: 'javascript',
            meta: 'live javascript',
            sandpackTemplate: 'vanilla',
            sandpackTheme: 'light',
            snippetFileName: '/index.js',
            snippetLanguage: 'javascript',
        },
        {
            label: 'JavaScript (dark)',
            name: 'javascript-dark',
            meta: 'live javascript',
            sandpackTemplate: 'vanilla',
            sandpackTheme: 'dark',
            snippetFileName: '/index.js',
            snippetLanguage: 'javascript',
        },
    ],
}

// Only import this to the next file
export default function InitializedMDXEditor({
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
                    codeBlockLanguages: {
                        js: 'JavaScript',
                        css: 'CSS',
                        html: 'HTML',
                        python: 'Python',
                        java: 'Java',
                    },
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
                        <div className="flex gap-2 flex-wrap items-center justify-center w-full">
                            <div
                                className='flex gap-2 items-center'
                                id="blockTypeSelect"
                            >
                                <BlockTypeSelect />
                            </div>
                            <div
                                className='flex gap-2 items-center'
                                id="BoldSelect"
                            >
                                <BoldItalicUnderlineToggles />
                                <Separator />
                            </div>
                            <div
                                className='flex gap-2 items-center'
                                id="creatLink"
                            >
                                <CreateLink />
                            </div>
                            <div
                                className='flex gap-2 items-center'
                                id="ListToggle"
                            >
                                <ListsToggle />
                                <Separator />
                            </div>
                            <div
                                className='flex gap-2 items-center'
                                id="UndoRedo"
                            >
                                <UndoRedo />
                                <Separator />
                            </div>
                            <div
                                className='flex gap-2 items-center'
                                id="InsertTable"
                            >
                                <InsertTable />
                            </div>
                            {/* <InsertImage /> */}
                            <div>
                                <ConditionalContents
                                    options={[
                                        {
                                            when: (editor) =>
                                                editor?.editorType ===
                                                'codeblock',
                                            contents: () => (
                                                <div
                                                    className='flex gap-2 items-center'
                                                    id="simpleCodeBlock"
                                                >
                                                    <ChangeCodeMirrorLanguage />
                                                </div>
                                            ),
                                        },
                                        {
                                            when: (editor) =>
                                                editor?.editorType ===
                                                'sandpack',
                                            contents: () => (
                                                <div
                                                    className='flex gap-2 items-center'
                                                    id="UI-Editor"
                                                >
                                                    <ShowSandpackInfo />
                                                </div>
                                            ),
                                        },
                                        {
                                            fallback: () => (
                                                <>
                                                    <div
                                                        className='flex gap-2 items-center'
                                                        id="InsertCodeBlock"
                                                    >
                                                        <InsertCodeBlock />
                                                    </div>
                                                    <div
                                                        className='flex gap-2 items-center'
                                                        id="InsertSandPack"
                                                    >
                                                        <InsertSandpack />
                                                    </div>
                                                </>
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    ),
                }),
                imagePlugin({
                    imageUploadHandler: async () => {
                        return await Promise.resolve(
                            'https://picsum.photos/200/300'
                        )
                    },
                    imageAutocompleteSuggestions: [
                        'https://picsum.photos/200/300',
                        'https://picsum.photos/200',
                    ],
                }),
            ]}
            contentEditableClassName="prose"
            {...props}
            ref={editorRef}
        />
    )
}
