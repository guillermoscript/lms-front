'use client'

/**
 * AI chat panel — the conversational landing-page assistant inside the Puck editor.
 *
 * Replaces the old fire-and-forget "Generate with AI" button with a multi-turn chat. Each turn
 * either rewrites the WHOLE page or edits the currently-SELECTED block, chosen automatically:
 *
 *   - No block selected → the assistant builds/rewrites the whole page (page intent).
 *   - A block selected   → the assistant edits just that block's props (block intent), leaving
 *                          every other block untouched.
 *
 * Lives INSIDE <Puck> so it can read live editor state via usePuck(): `appState` (current page),
 * `selectedItem` (the clicked block), and `dispatch` to apply changes. Page edits replace the
 * whole tree (setData); block edits replace only that one item's props via a functional setData
 * updater. Both are reversible with Puck's built-in undo (Ctrl/Cmd+Z).
 *
 * Talks to POST /api/landing/generate, which streams NDJSON: `progress` events while a page is
 * being built, then a single `page` or `block` result event. See route.ts and ADR 0001.
 */
import { useRef, useState } from 'react'
import { usePuck } from '@measured/puck'
import type { Data } from '@measured/puck'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { IconSparkles, IconArrowUp, IconUser } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** NDJSON events from the streaming endpoint. */
type StreamEvent =
  | { type: 'progress'; count: number; lastType?: string }
  | { type: 'page'; data: Data; blocks: number; reply: string }
  | { type: 'block'; targetId: string; blockType: string; props: Record<string, unknown>; reply: string }
  | { type: 'error'; status: number; error: string }

export function AiChatPanel() {
  const { appState, selectedItem, dispatch } = usePuck()
  const t = useTranslations('puck')

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // The block (if any) the user has selected — drives page-vs-block intent.
  const selected = selectedItem
    ? { id: selectedItem.props.id as string, type: selectedItem.type as string, props: selectedItem.props as Record<string, unknown> }
    : null

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  function cancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
    setStatus('')
  }

  /** Replace a single block's props in the current page by id (block intent). */
  function applyBlockEdit(targetId: string, props: Record<string, unknown>) {
    dispatch({
      type: 'setData',
      data: (previous: Data) => ({
        ...previous,
        content: previous.content.map((item) =>
          item.props.id === targetId ? { ...item, props: { ...props, id: targetId } } : item
        ),
      }),
    })
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setStatus(selected ? t('ai.editingBlock', { type: humanize(selected.type) }) : t('ai.generating'))
    scrollToBottom()

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/landing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          // Only send a selected block if it still exists in the current page.
          selectedBlock:
            selected && appState.data.content.some((c) => c.props.id === selected.id)
              ? selected
              : undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        appendAssistant(t('ai.failed'))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let replied = false

      // Map a server error status to a localized message (the server's `error` text is
      // English-only). Unmapped statuses fall back to the generic failure message.
      const translateError = (status: number): string => {
        if (status === 403) return t('ai.errorPlan')
        if (status === 429) return t('ai.errorRateLimit')
        if (status === 422) return t('ai.errorInvalid')
        return t('ai.failed')
      }

      const handle = (event: StreamEvent) => {
        if (event.type === 'progress') {
          setStatus(t('ai.buildingCount', { count: event.count }))
        } else if (event.type === 'page') {
          if (!event.data?.content?.length) {
            appendAssistant(t('ai.empty'))
            replied = true
            return
          }
          dispatch({ type: 'setData', data: event.data })
          // Localize the reply client-side from the structured event (the server's `reply`
          // string is English-only); the page event carries the block count.
          appendAssistant(t('ai.builtPage', { count: event.blocks }))
          replied = true
        } else if (event.type === 'block') {
          applyBlockEdit(event.targetId, event.props)
          appendAssistant(t('ai.updatedBlock', { block: humanize(event.blockType) }))
          replied = true
        } else if (event.type === 'error') {
          appendAssistant(translateError(event.status))
          replied = true
        }
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line) handle(JSON.parse(line) as StreamEvent)
        }
      }
      if (buffer.trim()) handle(JSON.parse(buffer.trim()) as StreamEvent)
      if (!replied) appendAssistant(t('ai.failed'))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error(t('ai.failed'))
    } finally {
      abortRef.current = null
      setLoading(false)
      setStatus('')
      scrollToBottom()
    }
  }

  function appendAssistant(content: string) {
    setMessages((prev) => [...prev, { role: 'assistant', content }])
    scrollToBottom()
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <IconSparkles className="w-4 h-4" />
        {t('ai.button')}
      </Button>

      <Sheet open={open} onOpenChange={(v) => { if (!v && loading) cancel(); setOpen(v) }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <IconSparkles className="w-4 h-4" />
              {t('ai.chatTitle')}
            </SheetTitle>
            <SheetDescription className="text-xs">{t('ai.chatDescription')}</SheetDescription>
          </SheetHeader>

          {/* Context chip: tells the user whether the next message edits a block or the page. */}
          <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            {selected ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                {t('ai.editingContext', { type: humanize(selected.type) })}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                {t('ai.pageContext')}
              </span>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="flex flex-col gap-4 px-4 py-4">
              {messages.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <p className="mb-2 font-medium text-foreground">{t('ai.emptyChatTitle')}</p>
                  <p>{t('ai.emptyChatHint')}</p>
                </div>
              )}
              {messages.map((m, i) => (
                <Message key={i} role={m.role} content={m.content} />
              ))}
              {loading && status && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                  <IconSparkles className="w-3.5 h-3.5 animate-pulse" />
                  {status}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="border-t p-3">
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder={selected ? t('ai.composerBlock', { type: humanize(selected.type) }) : t('ai.composerPage')}
                rows={2}
                className="resize-none pr-12"
              />
              <Button
                size="icon"
                onClick={() => (loading ? cancel() : send())}
                disabled={!loading && !input.trim()}
                className="absolute bottom-2 right-2 h-8 w-8"
                aria-label={loading ? t('ai.cancel') : t('ai.send')}
              >
                {loading ? <span className="h-3 w-3 rounded-sm bg-current" /> : <IconArrowUp className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-[0.7rem] text-muted-foreground">{t('ai.undoHint')}</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function Message({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex gap-2.5 text-sm', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {isUser ? <IconUser className="h-4 w-4" /> : <IconSparkles className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {content}
      </div>
    </div>
  )
}

/** "HeroBlock" → "hero", "FaqAccordion" → "FAQ accordion" (best-effort, for friendly labels). */
function humanize(type: string): string {
  const map: Record<string, string> = {
    HeroBlock: 'hero',
    FaqAccordion: 'FAQ',
    FaqSplit: 'FAQ',
    CtaBanner: 'call-to-action',
    CtaBlock: 'call-to-action',
    StatsBand: 'stats',
    StatsCounter: 'stats',
    AnimatedStats: 'stats',
    FeaturesGrid: 'features',
    TestimonialGrid: 'testimonials',
    PricingTable: 'pricing',
    ContentFeature: 'content section',
    TeamGrid: 'team',
    LogoCloud: 'logos',
    LogoMarquee: 'logos',
  }
  return (
    map[type] ??
    type.replace(/Block$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  )
}
