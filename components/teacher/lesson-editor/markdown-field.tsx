'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import {
  IconBold,
  IconItalic,
  IconList,
  IconLink,
  IconHeading,
  IconCode,
  IconEye,
  IconPencil,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// Both previews render with the exact component the reader gets, so "Preview"
// is a promise about the real surface rather than an approximation: lesson
// content is compiled as MDX, an AI task is the markdown the student runtime
// hands to Streamdown. Loaded on demand — either renderer is heavier than the
// editor around it, and a field only ever needs one of them.
const TaskInstructions = dynamic(
  () => import('@/components/student/task-instructions').then((m) => m.TaskInstructions),
  {
    ssr: false,
    loading: () => (
      <div className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />
    ),
  }
)

const MDXPreview = dynamic(
  () => import('@/components/teacher/mdx-preview').then((m) => m.MDXPreview),
  {
    ssr: false,
    loading: () => (
      <div className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />
    ),
  }
)

type ToolAction = 'bold' | 'italic' | 'heading' | 'list' | 'link' | 'code'

/**
 * The code-editor skin is deliberately theme-independent: it reads as a file
 * you are editing, not as a page surface, and it is the one place in the editor
 * where that is the point. Kept in one place so the palette can't drift.
 */
const TERMINAL = {
  surface: 'bg-[#1e1e2e]',
  text: 'text-[#cdd6f4]',
  caret: 'caret-[#89b4fa]',
  hairline: 'border-white/10',
}

interface MarkdownFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Which renderer the Preview tab uses. Must match what the reader gets. */
  preview?: 'markdown' | 'mdx'
  /**
   * `field` is a labelled form control. `terminal` is the code-editor shell
   * used for lesson MDX: dark chrome, filename strip, line count, monospace.
   */
  variant?: 'field' | 'terminal'
  /** field only. */
  label?: string
  hint?: string
  /** Rendered next to the label, e.g. a "hidden from students" badge. */
  badge?: React.ReactNode
  /** Rendered in the header, left of the write/preview switch. */
  actions?: React.ReactNode
  /** terminal only — shown in the filename strip. */
  filename?: string
}

export function MarkdownField({
  id,
  value,
  onChange,
  placeholder,
  preview = 'markdown',
  variant = 'field',
  label,
  hint,
  badge,
  actions,
  filename,
}: MarkdownFieldProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isTerminal = variant === 'terminal'

  const apply = (action: ToolAction) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart ?? value.length
    const end = textarea.selectionEnd ?? value.length
    const selected = value.slice(start, end)

    let next = value
    let selectFrom = start
    let selectTo = end

    if (action === 'bold' || action === 'italic') {
      const marker = action === 'bold' ? '**' : '*'
      next = value.slice(0, start) + marker + selected + marker + value.slice(end)
      selectFrom = start + marker.length
      selectTo = selectFrom + selected.length
    } else if (action === 'heading') {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const existing = value.slice(lineStart).match(/^#+ /)
      // Cycle off once the line is already a heading, so the button can undo itself.
      const prefix = existing ? '' : '## '
      const body = value.slice(lineStart + (existing?.[0].length ?? 0))
      next = value.slice(0, lineStart) + prefix + body
      selectFrom = selectTo = lineStart + prefix.length
    } else if (action === 'list') {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const block = value.slice(lineStart, end)
      const bulleted = block
        .split('\n')
        .map((line) => (line.startsWith('- ') ? line.slice(2) : `- ${line}`))
        .join('\n')
      next = value.slice(0, lineStart) + bulleted + value.slice(end)
      selectFrom = lineStart
      selectTo = lineStart + bulleted.length
    } else if (action === 'code') {
      const fence = '```'
      const before = value.slice(0, start)
      const after = value.slice(end)
      // A fence only opens a block when it starts its own line, so break out of
      // whatever it lands in the middle of.
      const lead = before && !before.endsWith('\n') ? '\n' : ''
      const trail = after && !after.startsWith('\n') ? '\n' : ''
      const snippet = `${lead}${fence}\n${selected}\n${fence}${trail}`
      next = before + snippet + after
      // Land on the language slot, which is the part still worth typing.
      selectFrom = selectTo = start + lead.length + fence.length
    } else {
      const text = selected || t('mdLinkText')
      const snippet = `[${text}](https://)`
      next = value.slice(0, start) + snippet + value.slice(end)
      // Land the caret on the URL, which is the part that still needs typing.
      selectFrom = start + text.length + 3
      selectTo = start + snippet.length - 1
    }

    onChange(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(selectFrom, selectTo)
    })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current
    if (!textarea) return

    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase()
      if (key === 'b') {
        event.preventDefault()
        apply('bold')
      } else if (key === 'i') {
        event.preventDefault()
        apply('italic')
      }
      return
    }

    // Code-editor affordances: only the MDX shell is a place where Tab means
    // indent rather than "leave this control".
    if (!isTerminal) return

    if (event.key === 'Tab') {
      event.preventDefault()
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      onChange(value.slice(0, start) + '  ' + value.slice(end))
      requestAnimationFrame(() => textarea.setSelectionRange(start + 2, start + 2))
    } else if (event.key === 'Enter') {
      const start = textarea.selectionStart
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const indent = value.slice(lineStart, start).match(/^(\s+)/)?.[1]
      if (!indent) return
      event.preventDefault()
      onChange(value.slice(0, start) + '\n' + indent + value.slice(start))
      requestAnimationFrame(() => {
        const pos = start + 1 + indent.length
        textarea.setSelectionRange(pos, pos)
      })
    }
  }

  const allTools: { action: ToolAction; icon: typeof IconBold; label: string }[] = [
    { action: 'bold', icon: IconBold, label: t('mdBold') },
    { action: 'italic', icon: IconItalic, label: t('mdItalic') },
    { action: 'heading', icon: IconHeading, label: t('mdHeading') },
    { action: 'list', icon: IconList, label: t('mdList') },
    { action: 'link', icon: IconLink, label: t('mdLink') },
    { action: 'code', icon: IconCode, label: t('mdCode') },
  ]

  // Prose fields get the writing marks; headings and fences belong to MDX.
  const tools = isTerminal
    ? allTools
    : allTools.filter((tool) => tool.action !== 'heading' && tool.action !== 'code')

  const lineCount = value.split('\n').length

  const modeSwitch = (
    <div
      className={cn(
        'inline-flex items-center rounded-lg p-0.5',
        isTerminal ? 'bg-white/5' : 'border bg-muted/40'
      )}
    >
      {(['write', 'preview'] as const).map((tab) => {
        const Icon = tab === 'write' ? IconPencil : IconEye
        const active = mode === tab
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setMode(tab)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              isTerminal
                ? active
                  ? 'bg-white/15 text-white/90'
                  : 'text-white/40 hover:text-white/70'
                : active
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {t(tab === 'write' ? 'mdWrite' : 'mdPreview')}
          </button>
        )
      })}
    </div>
  )

  const toolbar = (
    <div
      className={cn(
        'flex items-center gap-0.5 border-b',
        isTerminal ? cn(TERMINAL.hairline, 'px-2.5 py-1.5') : 'px-1.5 py-1'
      )}
    >
      {tools.map(({ action, icon: Icon, label: toolLabel }) => (
        <button
          key={action}
          type="button"
          onClick={() => apply(action)}
          title={toolLabel}
          aria-label={toolLabel}
          className={cn(
            'rounded-sm p-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            isTerminal
              ? 'text-white/40 hover:bg-white/10 hover:text-white/80'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </button>
      ))}
    </div>
  )

  const textarea = (
    <textarea
      id={id}
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      spellCheck={!isTerminal}
      className={cn(
        'field-sizing-content block w-full resize-y bg-transparent outline-none',
        isTerminal
          ? cn(
              'min-h-[26rem] max-h-[70vh] overflow-y-auto px-4 py-3 font-mono text-[13px] leading-6',
              TERMINAL.text,
              TERMINAL.caret,
              'placeholder:text-white/20'
            )
          : 'min-h-36 max-h-96 overflow-y-auto px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/60'
      )}
    />
  )

  const previewPane = (
    <div
      className={cn(
        'overflow-y-auto',
        isTerminal
          ? 'min-h-[26rem] max-h-[70vh] bg-background px-5 py-4'
          : 'min-h-36 max-h-96 rounded-lg border px-4 py-3'
      )}
    >
      {value.trim() ? (
        preview === 'mdx' ? (
          <MDXPreview content={value} />
        ) : (
          <TaskInstructions text={value} />
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t('mdPreviewEmpty')}</p>
      )}
    </div>
  )

  if (isTerminal) {
    return (
      <div className={cn('overflow-hidden rounded-xl border', TERMINAL.surface)}>
        <div
          className={cn(
            'flex items-center justify-between gap-3 border-b bg-white/5 px-4 py-2',
            TERMINAL.hairline
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div aria-hidden="true" className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500/70" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <div className="h-3 w-3 rounded-full bg-green-500/70" />
            </div>
            {filename && (
              <span className="ml-2 truncate text-[11px] font-medium text-white/40">
                {filename}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] tabular-nums text-white/30">
              {lineCount} {t('lines')}
            </span>
            {actions}
            {modeSwitch}
          </div>
        </div>

        {mode === 'write' ? (
          <>
            {toolbar}
            {textarea}
          </>
        ) : (
          previewPane
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
          </Label>
          {badge}
        </div>

        <div className="flex items-center gap-2">
          {actions}
          {modeSwitch}
        </div>
      </div>

      {mode === 'write' ? (
        <div className="rounded-lg border bg-input/20 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
          {toolbar}
          {textarea}
        </div>
      ) : (
        previewPane
      )}

      <div className="flex items-baseline justify-between gap-4">
        {hint ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {t('charCount', { count: value.length })}
        </span>
      </div>
    </div>
  )
}
