"use client"

import React, { useImperativeHandle, useRef } from 'react'

interface MarkdownEditorProps {
  id?: string
  value: string
  onChange: (val: string) => void
  rows?: number
  placeholder?: string
  className?: string
  ref?: React.Ref<MarkdownEditorHandle>
}

export type MarkdownEditorHandle = {
  insertSnippet: (snippet: string) => void
  focus: () => void
}

export default function MarkdownEditor({
  id, value, onChange, rows = 12, placeholder, className, ref,
}: MarkdownEditorProps) {
    const taRef = useRef<HTMLTextAreaElement | null>(null)

    useImperativeHandle(ref, () => ({
      insertSnippet(snippet: string) {
        const ta = taRef.current
        if (!ta) return
        const start = ta.selectionStart ?? value.length
        const end = ta.selectionEnd ?? value.length
        const before = value.slice(0, start)
        const after = value.slice(end)
        const newVal = before + snippet + after
        onChange(newVal)
        // move caret after inserted snippet
        requestAnimationFrame(() => {
          const pos = start + snippet.length
          ta.focus()
          ta.setSelectionRange(pos, pos)
        })
      },
      focus() {
        taRef.current?.focus()
      },
    }))

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = taRef.current
      if (!ta) return
      if (e.key === 'Tab') {
        e.preventDefault()
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const newVal = value.substring(0, start) + '  ' + value.substring(end)
        onChange(newVal)
        requestAnimationFrame(() => ta.setSelectionRange(start + 2, start + 2))
      } else if (e.key === 'Enter') {
        // auto indent
        const start = ta.selectionStart
        const lineStart = value.lastIndexOf('\n', start - 1) + 1
        const line = value.slice(lineStart, start)
        const match = line.match(/^(\s+)/)
        if (match) {
          e.preventDefault()
          const indent = match[1]
          const newVal = value.slice(0, start) + '\n' + indent + value.slice(start)
          onChange(newVal)
          requestAnimationFrame(() => {
            const pos = start + 1 + indent.length
            ta.setSelectionRange(pos, pos)
          })
        }
      }
    }

    const wrapSelection = (before: string, after = before) => {
      const ta = taRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const sel = value.slice(start, end)
      const newVal = value.slice(0, start) + before + sel + after + value.slice(end)
      onChange(newVal)
      requestAnimationFrame(() => {
        const s = start + before.length
        const e = s + sel.length
        ta.focus()
        ta.setSelectionRange(s, e)
      })
    }

    return (
      <div className={className}>
        <div className="mb-2 flex gap-2">
          <button type="button" className="btn-sm" onClick={() => wrapSelection('**', '**')}>
            Bold
          </button>
          <button type="button" className="btn-sm" onClick={() => wrapSelection('*', '*')}>
            Italic
          </button>
          <button type="button" className="btn-sm" onClick={() => wrapSelection('# ', '')}>
            H1
          </button>
          <button type="button" className="btn-sm" onClick={() => wrapSelection('```javascript\n', '\n```')}>
            Code
          </button>
        </div>

        <textarea
          id={id}
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="w-full font-mono text-sm rounded border px-3 py-2 resize-vertical min-h-[200px]"
        />
      </div>
    )
}
