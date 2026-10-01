'use client'

import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { IconUser } from '@tabler/icons-react'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { searchMentionCandidates } from '@/app/actions/community'
import { findMentionQuery, insertMention, type MentionCandidate } from '@/lib/community/mentions'

/** Who can be mentioned: people who can see a reply on this post, or a new post in this feed. */
export type MentionContext = { postId: string } | { courseId: number | null }

type MentionTextareaProps = Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  mentionContext: MentionContext
}

const SEARCH_DEBOUNCE_MS = 150

/**
 * A community composer textarea with @mention autocomplete (#876).
 *
 * Typing `@` (at the start or after a space) and a few letters lists up to 8
 * members who can see what is being written; ↑/↓ move, Enter or Tab picks,
 * Escape closes. Picking writes `[@Name](mention:<uuid>)` — the database turns
 * that into a mention (and a notification) only for someone who may see it.
 */
export function MentionTextarea({
  value,
  onValueChange,
  mentionContext,
  onKeyDown,
  onSelect,
  onBlur,
  className,
  ...props
}: MentionTextareaProps) {
  const t = useTranslations('community.mentions')
  const tRole = useTranslations('community.roleBadge')
  const listId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const requestSeq = useRef(0)

  const [active, setActive] = useState<{ query: string; start: number } | null>(null)
  const [candidates, setCandidates] = useState<MentionCandidate[]>([])
  const [highlight, setHighlight] = useState(0)
  const [loading, setLoading] = useState(false)

  const postId = 'postId' in mentionContext ? mentionContext.postId : null
  const courseId = 'courseId' in mentionContext ? mentionContext.courseId : null
  const query = active?.query ?? null

  useEffect(() => {
    if (query === null) return
    const seq = ++requestSeq.current
    const timer = setTimeout(async () => {
      setLoading(true)
      const result = await searchMentionCandidates({ query, postId, courseId }).catch(() => null)
      if (seq !== requestSeq.current) return // a newer query won
      setLoading(false)
      setCandidates(result?.success ? (result.data ?? []) : [])
      setHighlight(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, postId, courseId])

  // Put the caret after an inserted mention once React has written the value.
  useEffect(() => {
    const caret = pendingCaret.current
    const el = textareaRef.current
    if (caret === null || !el) return
    pendingCaret.current = null
    el.focus()
    el.setSelectionRange(caret, caret)
  }, [value])

  function close() {
    requestSeq.current++
    setActive(null)
    setCandidates([])
    setLoading(false)
  }

  function track(el: HTMLTextAreaElement) {
    const caret = el.selectionStart === el.selectionEnd ? el.selectionStart : -1
    const next = findMentionQuery(el.value, caret)
    if (!next) {
      if (active) close()
      return
    }
    if (next.query !== active?.query || next.start !== active?.start) setActive(next)
  }

  function pick(candidate: MentionCandidate) {
    const el = textareaRef.current
    if (!active || !el) return
    const result = insertMention(value, { start: active.start, caret: el.selectionStart }, candidate)
    pendingCaret.current = result.caret
    close()
    onValueChange(result.text)
  }

  const open = active !== null && (candidates.length > 0 || (!loading && active.query.length > 0))

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && candidates.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setHighlight((h) => (h + step + candidates.length) % candidates.length)
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(candidates[Math.min(highlight, candidates.length - 1)])
        return
      }
    }
    if (open && e.key === 'Escape') {
      // Close the list, not the dialog or sheet around the composer.
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    onKeyDown?.(e)
  }

  const optionId = (i: number) => `${listId}-option-${i}`

  return (
    <div className="relative min-w-0">
      <Textarea
        {...props}
        ref={textareaRef}
        value={value}
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value)
          track(e.target)
        }}
        onSelect={(e) => {
          track(e.currentTarget)
          onSelect?.(e)
        }}
        onBlur={(e) => {
          close()
          onBlur?.(e)
        }}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && candidates.length > 0 ? optionId(highlight) : undefined}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('listLabel')}
          data-testid="mention-candidates"
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-72 max-w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {candidates.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground" role="presentation">
              {t('noMatches')}
            </li>
          ) : (
            candidates.map((c, i) => (
              <li
                key={c.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === highlight}
                // Keep focus in the textarea; pick on press.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(c)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  i === highlight && 'bg-accent text-accent-foreground'
                )}
              >
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={c.avatarUrl || undefined} alt="" />
                  <AvatarFallback>
                    <IconUser size={12} aria-hidden />
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {(c.role === 'teacher' || c.role === 'admin') && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">{tRole(c.role)}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
