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

export default function MonacoEditor({
    readOnly,
    userCode
}: {
    readOnly: boolean
    userCode?: string
}) {
    const { code, updateCode } = useActiveCode()
    const { sandpack } = useSandpack()

    return (
        <SandpackStack style={{ height: '100vh', margin: 0 }}>
            <SandpackFileExplorer
                autoHiddenFiles
            />
            <FileTabs />
            <div style={{ flex: 1, paddingTop: 8, background: '#1e1e1e' }}>
                <Editor
                    width="100%"
                    height="100%"
                    language='typescript'
                    theme="vs-dark"
                    key={sandpack.activeFile}
                    defaultValue={userCode || code}
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
