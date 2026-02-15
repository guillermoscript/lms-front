'use client'

import type { CodeBlock } from '../types'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconCode } from '@tabler/icons-react'

interface CodeBlockEditorProps {
  block: CodeBlock
  onChange: (updates: Partial<CodeBlock>) => void
}

const languages = [
  'javascript',
  'typescript',
  'python',
  'java',
  'html',
  'css',
  'json',
  'sql',
  'bash',
  'text',
]

export function CodeBlockEditor({ block, onChange }: CodeBlockEditorProps) {
  return (
    <div className="rounded-lg border bg-[#0d1117] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-700 bg-[#161b22] px-3 py-2">
        <IconCode className="h-4 w-4 text-gray-400" />
        <Select
          value={block.language}
          onValueChange={(v) => v && onChange({ language: v })}
        >
          <SelectTrigger className="w-28 h-7 text-xs bg-transparent border-gray-600 text-gray-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={block.filename || ''}
          onChange={(e) => onChange({ filename: e.target.value || undefined })}
          placeholder="archivo.js (opcional)"
          className="flex-1 h-7 text-xs bg-transparent border-gray-600 text-gray-300 placeholder:text-gray-500"
        />
      </div>
      <Textarea
        value={block.code}
        onChange={(e) => onChange({ code: e.target.value })}
        placeholder="// Tu código aquí..."
        className="min-h-[120px] font-mono text-sm text-gray-300 bg-transparent border-0 rounded-none resize-y focus-visible:ring-0"
      />
    </div>
  )
}
