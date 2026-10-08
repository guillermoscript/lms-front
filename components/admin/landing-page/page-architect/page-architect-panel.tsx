'use client'

/**
 * The docked Page Architect chat (design §3.6, critique A6/B6/C7).
 *
 * Mounted beside the canvas through `overrides.puck`, so Puck's default header (publish,
 * undo/redo, viewports) stays and nothing covers the canvas. The assistant's text and a live
 * line per tool call stream in; ops land on the canvas as they arrive; one Ctrl+Z reverts a
 * whole turn.
 */
import type { ComponentProps } from 'react'
import { useEffect, useMemo } from 'react'
import { createUsePuck, useGetPuck } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconArrowBackUp, IconPointer, IconRotateClockwise2, IconSparkles, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputController,
} from '@/components/ai-elements/prompt-input'
import { Suggestion } from '@/components/ai-elements/suggestion'
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { AiErrorNotice } from '@/components/ai/ai-error-notice'
import { useAiChatSubmit } from '@/hooks/use-ai-chat-submit'
import { isAiSetupErrorKind, parseAiChatError } from '@/lib/ai/chat-error'
import { cn } from '@/lib/utils'
import { ThemePreviewBar } from './theme-preview'
import { ToolLine, humanizeBlockType, toolNameOf, type ToolPartLike } from './tool-line'
import { usePageArchitect } from './use-page-architect'

const usePuckSelector = createUsePuck()

export type PageKind = 'new' | 'home' | 'course' | 'product' | 'pricing'

const COURSE_BLOCKS = new Set(['CourseHero', 'CourseCurriculum', 'CourseOutcomes', 'CoursePricingCard', 'InstructorCard'])

/** What kind of page this is, for the example prompts. */
export function inferPageKind(data: { content?: Array<{ type?: string }> } | undefined): PageKind {
  const types = (data?.content ?? []).map((item) => item?.type ?? '')
  if (types.length === 0) return 'new'
  if (types.some((type) => COURSE_BLOCKS.has(type))) return 'course'
  if (types.includes('ProductGrid')) return 'product'
  if (types.includes('PricingTable') && types.length <= 4) return 'pricing'
  return 'home'
}

interface Props {
  pageId: string
  locale: 'en' | 'es'
  onClose: () => void
  className?: string
}

function ApprovalCard({
  part,
  label,
  onRespond,
}: {
  part: ToolPartLike
  label: string
  onRespond: (id: string, approved: boolean) => void
}) {
  const t = useTranslations('pageArchitect.panel.approval')
  const approvalId = part.approval?.id
  const requested = part.state === 'approval-requested'
  // Keep keyboard and screen-reader users on the card while it asks.
  useEffect(() => {
    if (!approvalId || !requested) return
    document.querySelector<HTMLElement>(`[data-approval-id="${CSS.escape(approvalId)}"]`)?.focus()
  }, [approvalId, requested])
  if (!part.approval) return null
  const id = part.approval.id
  const name = toolNameOf(part)
  const question = name === 'apply_template' ? t('applyTemplate') : name === 'remove_block' ? t('removeBlocks') : t('generic')
  return (
    <Confirmation
      approval={part.approval as never}
      state={part.state as never}
      role="alertdialog"
      aria-label={t('title')}
      tabIndex={-1}
      data-approval-id={id}
      data-testid="page-architect-approval"
    >
      <ConfirmationTitle className="grid gap-1">
        <ConfirmationRequest>
          <span className="block text-sm font-medium">{question}</span>
          <span className="block text-xs text-muted-foreground">{part.approval.reason ? `${label} · ${part.approval.reason}` : label}</span>
        </ConfirmationRequest>
        <ConfirmationAccepted>
          <span className="text-sm">{t('approved', { label })}</span>
        </ConfirmationAccepted>
        <ConfirmationRejected>
          <span className="text-sm">{t('denied', { label })}</span>
        </ConfirmationRejected>
      </ConfirmationTitle>
      <ConfirmationActions>
        <ConfirmationAction variant="outline" onClick={() => onRespond(id, false)}>
          {t('deny')}
        </ConfirmationAction>
        <ConfirmationAction onClick={() => onRespond(id, true)}>{t('approve')}</ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  )
}

function Inner({ pageId, locale, onClose, className }: Props) {
  const t = useTranslations('pageArchitect.panel')
  const tLimits = useTranslations('aiChatLimits')
  const { textInput } = usePromptInputController()
  const getPuck = useGetPuck()

  const arch = usePageArchitect({
    pageId,
    locale,
    onHistoryAbort: () => toast.info(t('undoStopped')),
  })
  const {
    messages,
    status,
    sendMessage,
    stop,
    error,
    clearError,
    regenerate,
    setMessages,
    addToolApprovalResponse,
    isBusy,
    statusLabel,
    lastApplied: appliedCount,
    lastAppliedHistoryIndex,
    clearLastApplied,
  } = arch

  const selectedId = usePuckSelector((s) => (typeof s.selectedItem?.props?.id === 'string' ? s.selectedItem.props.id : null))
  const selectedType = usePuckSelector((s) => s.selectedItem?.type ?? null)
  const pageKind = usePuckSelector((s) => inferPageKind(s.appState.data))
  const historyIndex = usePuckSelector((s) => s.history.index)
  // "Undo" reverts the AI turn only while its history entry is the current one: a manual
  // edit (or an undo) after it moves the index, and the offer goes away.
  const lastApplied = appliedCount !== null && historyIndex === lastAppliedHistoryIndex ? appliedCount : null

  const typeLabel = useMemo(
    () => (type: string) => {
      const label = (getPuck().config.components[type] as { label?: unknown } | undefined)?.label
      return typeof label === 'string' && label ? label : humanizeBlockType(type)
    },
    [getPuck]
  )
  const blockLabel = useMemo(
    () => (id: string) => {
      const puck = getPuck()
      const selector = puck.getSelectorForId(id)
      const item = selector ? puck.getItemBySelector(selector) : undefined
      return item ? typeLabel(item.type as string) : null
    },
    [getPuck, typeLabel]
  )

  const onSubmit = useAiChatSubmit({ sendMessage, clearInput: textInput.clear, disabled: isBusy })
  const suggestions = [t(`suggestions.${pageKind}.one`), t(`suggestions.${pageKind}.two`), t(`suggestions.${pageKind}.three`)]
  const errorInfo = error && status === 'error' ? parseAiChatError(error) : null

  const clearSelection = () => getPuck().dispatch({ type: 'setUi', ui: { itemSelector: null } })
  const undoTurn = () => {
    clearLastApplied()
    getPuck().history.back()
  }
  const retry = () => {
    clearError()
    void regenerate()
  }

  return (
    <aside
      aria-label={t('title')}
      className={cn('flex h-full min-h-0 flex-col border-l bg-background text-foreground', className)}
      data-testid="page-architect-panel"
    >
      <header className="flex shrink-0 items-start gap-2 border-b px-4 py-3">
        <IconSparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{t('title')}</h2>
          <p className="text-xs leading-snug text-muted-foreground">{t('subtitle')}</p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMessages([])}
            disabled={isBusy}
            aria-label={t('newChat')}
            title={t('newChat')}
          >
            <IconRotateClockwise2 className="size-4" aria-hidden />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('close')} title={t('close')}>
          <IconX className="size-4" aria-hidden />
        </Button>
      </header>

      <ThemePreviewBar />

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 px-4 py-4">
          {messages.length === 0 && (
            <div className="grid gap-1 text-muted-foreground">
              <p className="text-sm font-medium text-foreground">{t(`empty.${pageKind}.title`)}</p>
              <p className="text-sm leading-relaxed">{t(`empty.${pageKind}.body`)}</p>
            </div>
          )}

          {messages.map((message) => (
            <Message key={message.id} from={message.role as ComponentProps<typeof Message>['from']}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return part.text ? <MessageResponse key={index}>{part.text}</MessageResponse> : null
                  }
                  const p = part as ToolPartLike
                  const name = toolNameOf(p)
                  if (!name) return null
                  if (
                    p.approval &&
                    (p.state === 'approval-requested' || p.state === 'approval-responded' || p.state === 'output-denied')
                  ) {
                    const input = (p.input ?? {}) as Record<string, unknown>
                    const label =
                      typeof input.templateId === 'string'
                        ? input.templateId
                        : typeof input.id === 'string'
                          ? (blockLabel(input.id) ?? input.id)
                          : name
                    return (
                      <ApprovalCard
                        key={index}
                        part={p}
                        label={label}
                        onRespond={(id, approved) => addToolApprovalResponse({ id, approved })}
                      />
                    )
                  }
                  return <ToolLine key={index} part={p} blockLabel={blockLabel} typeLabel={typeLabel} />
                })}
              </MessageContent>
            </Message>
          ))}

          {isBusy && (
            <div className="text-sm" data-testid="page-architect-status">
              <Shimmer as="span" className="text-sm">
                {statusLabel ?? (status === 'submitted' ? t('thinking') : t('working'))}
              </Shimmer>
            </div>
          )}

          {!isBusy && lastApplied !== null && lastApplied > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="min-w-0">{t('applied', { count: lastApplied })}</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={undoTurn}>
                <IconArrowBackUp className="size-3.5" aria-hidden />
                {t('undo')}
              </Button>
            </div>
          )}

          {errorInfo &&
            (isAiSetupErrorKind(errorInfo.kind) ? (
              <AiErrorNotice
                code={errorInfo.kind}
                canConfigure={errorInfo.canConfigure}
                settingsUrl={errorInfo.settingsUrl}
                audience="teacher"
              >
                <Button variant="outline" size="sm" className="shrink-0" onClick={retry}>
                  {t('retry')}
                </Button>
              </AiErrorNotice>
            ) : (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="page-architect-error"
              >
                <span className="min-w-0">{errorInfo.kind === 'generic' ? t('error') : tLimits(errorInfo.kind)}</span>
                <Button variant="outline" size="sm" className="shrink-0" onClick={retry}>
                  {t('retry')}
                </Button>
              </div>
            ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Polite announcements for screen readers: what the AI is doing / did. */}
      <p className="sr-only" aria-live="polite">
        {isBusy ? (statusLabel ?? t('working')) : lastApplied ? t('applied', { count: lastApplied }) : ''}
      </p>

      <div className="grid shrink-0 gap-2 border-t px-3 pb-3 pt-3">
        {messages.length === 0 && (
          <ul className="grid gap-1.5" aria-label={t('examples')}>
            {suggestions.map((s) => (
              <li key={s}>
                <Suggestion
                  suggestion={s}
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal rounded-md px-2 py-1.5 text-left text-xs font-normal text-muted-foreground hover:text-foreground"
                  onClick={(text) => void sendMessage({ text })}
                />
              </li>
            ))}
          </ul>
        )}
        {selectedId && selectedType && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconPointer className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{t('selected', { block: typeLabel(selectedType) })}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto size-6"
              onClick={clearSelection}
              disabled={isBusy}
              aria-label={t('clearSelection')}
              title={t('clearSelection')}
            >
              <IconX className="size-3" aria-hidden />
            </Button>
          </div>
        )}
        <PromptInput onSubmit={onSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={selectedId ? t('placeholderSelected') : t('placeholder')}
              aria-label={t('placeholder')}
              className="min-h-[48px] text-sm"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="text-[11px] text-muted-foreground">{isBusy ? t('locked') : ''}</span>
            <PromptInputSubmit
              status={status as ComponentProps<typeof PromptInputSubmit>['status']}
              onStop={() => void stop()}
              aria-label={isBusy ? t('stop') : t('send')}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </aside>
  )
}

export function PageArchitectPanel(props: Props) {
  return (
    <PromptInputProvider>
      <Inner {...props} />
    </PromptInputProvider>
  )
}
