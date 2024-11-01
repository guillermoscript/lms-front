'use client'
// Dynamically import the code editor to avoid SSR issues
import {
    FileTabs,
    SandpackFileExplorer,
    SandpackStack,
    useActiveCode,
    useSandpack,
} from '@codesandbox/sandpack-react'
import Editor from '@monaco-editor/react'
import { useEffect } from 'react'
// import dynamic from 'next/dynamic'

// const CodeEditor = dynamic(async () => await import('@/components/dashboards/student/course/exercises/CodeEditor'), { ssr: false })

export default function MonacoEditor({
    autoHiddenFiles,
    readOnly,
    userCode
}: {
    autoHiddenFiles: boolean
    readOnly: boolean
    userCode?: string

}) {
    const { code, updateCode } = useActiveCode()
    const { sandpack } = useSandpack()

    useEffect(() => {
        if (userCode) {
            updateCode(userCode)
        }
    }, [])

    return (
        <SandpackStack style={{ height: '100vh', margin: 0 }}>
            <SandpackFileExplorer
                autoHiddenFiles={autoHiddenFiles}
            />
            <FileTabs
                closableTabs
            />
            <div style={{ flex: 1, paddingTop: 8, background: '#1e1e1e' }}>
                <Editor
                    width="100%"
                    height="100%"
                    language='typescript'
                    theme="vs-dark"
                    key={sandpack.activeFile}
                    defaultValue={code}
                    onChange={(value) => {
                        if (readOnly) {
                            return
                        }
                        updateCode(value || '')
                    }}

                />
            </div>
        </SandpackStack>
    )
}
