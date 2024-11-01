// CodeEditor.js
import Editor from '@monaco-editor/react'

const CodeEditor = ({ initialCode, onChange }: {
    initialCode: string,
    onChange: (value: string) => void
}) => {
    return (
        <Editor
            height="400px"
            defaultLanguage="javascript"
            defaultValue={initialCode}
            onChange={(value) => onChange(value)}
            theme="vs-dark" // Puedes elegir entre varios temas disponibles
        />
    )
}

export default CodeEditor
