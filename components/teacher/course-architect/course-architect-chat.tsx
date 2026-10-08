'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import type { ComponentProps } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { IconCheck, IconAlertTriangle, IconRotateClockwise2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
    PromptInput,
    PromptInputBody,
    PromptInputFooter,
    PromptInputSubmit,
    PromptInputTextarea,
    PromptInputProvider,
    usePromptInputController,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
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
import { useAiChatSubmit } from '@/hooks/use-ai-chat-submit'
import { AiErrorNotice, useAiChatErrorToast } from '@/components/ai/ai-error-notice'
import { parseAiChatError, isAiSetupErrorKind } from '@/lib/ai/chat-error'
import type { ArchitectScope } from './scope'

export interface ContentChange {
    toolName: string
    output: unknown
}

interface Props {
    scope: ArchitectScope
    locale: 'en' | 'es'
    onContentChanged?: (change: ContentChange) => void
    className?: string
}

interface ToolPartLike {
    type: string
    toolName?: string
    toolCallId?: string
    state?: string
    input?: unknown
    output?: unknown
    approval?: { id: string; approved?: boolean; reason?: string }
}

function toolNameOf(part: ToolPartLike): string | null {
    if (part.type === 'dynamic-tool') return part.toolName ?? null
    if (part.type.startsWith('tool-')) return part.type.slice(5)
    return null
}

/** Every allowlisted tool that is not a read (list/get) changes content. Kept local so the client bundle does not import the server-only MCP client. */
function isWriteTool(name: string): boolean {
    return name.startsWith('lms_') && !/^lms_(list|get)_/.test(name)
}

function isErrorOutput(part: ToolPartLike): boolean {
    if (part.state === 'output-error') return true
    return Boolean((part.output as { isError?: boolean } | undefined)?.isError)
}

function ToolLine({ part }: { part: ToolPartLike }) {
    const t = useTranslations('courseArchitect')
    const name = toolNameOf(part)
    if (!name) return null

    const m = /^lms_([a-z]+)_(.+)$/.exec(name)
    const verb = m?.[1] ?? ''
    const rest = m?.[2] ?? name
    const entity = t.has(`entities.${rest}`) ? t(`entities.${rest}`) : rest.replace(/_/g, ' ')
    const verbKey = t.has(`verbs.${verb}`) ? verb : 'other'
    const input = part.input as { title?: unknown } | undefined
    const title = typeof input?.title === 'string' ? input.title : null

    const done = part.state === 'output-available' || part.state === 'output-error'
    const failed = done && isErrorOutput(part)
    const label = t(`${failed ? 'failed' : done ? 'done' : 'running'}.${verbKey}`, { entity })

    return (
        <div
            className="flex items-center gap-2 text-xs text-muted-foreground"
            data-testid="architect-tool-line"
        >
            {failed ? (
                <IconAlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden />
            ) : done ? (
                <IconCheck className="size-3.5 shrink-0 text-success" aria-hidden />
            ) : (
                <span className="size-3.5 shrink-0 animate-pulse rounded-full bg-primary/40 motion-reduce:animate-none" aria-hidden />
            )}
            <span className="min-w-0 truncate">
                {label}
                {title ? ` · ${title}` : ''}
            </span>
        </div>
    )
}

function humanize(name: string, t: ReturnType<typeof useTranslations>) {
    const m = /^lms_([a-z]+)_(.+)$/.exec(name)
    const verb = m?.[1] ?? ''
    const rest = m?.[2] ?? name
    const entity = t.has(`entities.${rest}`) ? t(`entities.${rest}`) : rest.replace(/_/g, ' ')
    const verbKey = t.has(`verbs.${verb}`) ? verb : 'other'
    return t(`running.${verbKey}`, { entity })
}

function ApprovalCard({ part, onRespond }: { part: ToolPartLike; onRespond: (id: string, approved: boolean) => void }) {
    const t = useTranslations('courseArchitect')
    const approvalId = part.approval?.id
    const requested = part.state === 'approval-requested'
    // Move focus to the card when it appears and keep it there once the buttons unmount, so keyboard/SR users are not dropped to <body>.
    useEffect(() => {
        if (!approvalId) return
        document.querySelector<HTMLElement>(`[data-approval-id="${CSS.escape(approvalId)}"]`)?.focus({ preventScroll: false })
    }, [approvalId, requested])
    const name = toolNameOf(part)
    if (!name || !part.approval) return null
    const input = (part.input ?? {}) as Record<string, unknown>
    const details: string[] = []
    for (const key of ['title', 'name', 'lesson_id', 'course_id', 'exercise_id', 'exam_id', 'product_id', 'publish_at', 'scheduled_for']) {
        const v = input[key]
        if (typeof v === 'string' || typeof v === 'number') details.push(`${t(`approval.fields.${key}`)}: ${v}`)
    }
    const price = input.price ?? input.amount
    if (typeof price === 'number' || typeof price === 'string') {
        details.push(`${t('approval.price')}: ${price}${typeof input.currency === 'string' ? ` ${input.currency.toUpperCase()}` : ''}`)
    }
    const id = part.approval.id
    return (
        <Confirmation approval={part.approval as never} state={part.state as never} role="alertdialog" aria-label={t('approval.title')} tabIndex={-1} data-approval-id={id} data-testid="architect-approval">
            <ConfirmationTitle className="grid gap-1">
                <ConfirmationRequest>
                    <span className="block text-sm font-medium">{t('approval.title')}: {humanize(name, t)}</span>
                    {details.length > 0 && <span className="block text-xs text-muted-foreground">{details.join(' · ')}</span>}
                </ConfirmationRequest>
                <ConfirmationAccepted>
                    <span className="text-sm">{t('approval.approved')}: {humanize(name, t)}</span>
                </ConfirmationAccepted>
                <ConfirmationRejected>
                    <span className="text-sm">{t('approval.denied')}: {humanize(name, t)}</span>
                </ConfirmationRejected>
            </ConfirmationTitle>
            <ConfirmationActions>
                <ConfirmationAction variant="outline" onClick={() => onRespond(id, false)}>{t('approval.deny')}</ConfirmationAction>
                <ConfirmationAction onClick={() => onRespond(id, true)}>{t('approval.approve')}</ConfirmationAction>
            </ConfirmationActions>
        </Confirmation>
    )
}

function Inner({ scope, locale, onContentChanged, className }: Props) {
    const t = useTranslations('courseArchitect')
    const onChatError = useAiChatErrorToast({ audience: 'teacher', genericMessage: t('error') })
    const { textInput } = usePromptInputController()

    // Scope and locale ride on every request, including the automatic resend after an approval.
    const bodyRef = useRef({ scope, locale })
    useEffect(() => {
        bodyRef.current = { scope, locale }
    }, [scope, locale])
    const transport = useMemo(
        () =>
            // eslint-disable-next-line react-hooks/refs
            new DefaultChatTransport({
                api: '/api/chat/course-architect',
                // Read at send time (event), not render time.
                prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, ...bodyRef.current, messages } }),
            }),
        [],
    )

    const { messages, status, sendMessage: rawSend, setMessages, addToolApprovalResponse, error, clearError, regenerate } = useChat({
        transport,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onError: onChatError,
    })

    const sendMessage = rawSend
    const errorInfo = error ? parseAiChatError(error) : null
    const setupError = errorInfo && isAiSetupErrorKind(errorInfo.kind) ? { ...errorInfo, kind: errorInfo.kind } : null

    const isLoading = status === 'submitted' || status === 'streaming'
    const onSubmit = useAiChatSubmit({ sendMessage, clearInput: textInput.clear })

    // Report each successful content-changing call exactly once.
    const seen = useRef(new Set<string>())
    const onChangedRef = useRef(onContentChanged)
    useEffect(() => {
        onChangedRef.current = onContentChanged
    }, [onContentChanged])
    useEffect(() => {
        for (const message of messages) {
            for (const raw of message.parts) {
                const part = raw as ToolPartLike
                const name = toolNameOf(part)
                if (!name || part.state !== 'output-available' || !part.toolCallId) continue
                if (!isWriteTool(name) || isErrorOutput(part)) continue
                if (seen.current.has(part.toolCallId)) continue
                seen.current.add(part.toolCallId)
                onChangedRef.current?.({ toolName: name, output: part.output })
            }
        }
    }, [messages])

    const suggestions =
        scope.type === 'new'
            ? [t('suggestions.new.one'), t('suggestions.new.two'), t('suggestions.new.three')]
            : [
                  t(`suggestions.${scope.type}.one`),
                  t(`suggestions.${scope.type}.two`),
                  t(`suggestions.${scope.type}.three`),
              ]

    return (
        <div className={className ?? 'flex h-full min-h-0 flex-col'}>
            <Conversation>
                <ConversationContent>
                    {messages.length === 0 && (
                        <div className="flex flex-col gap-2 p-4 text-muted-foreground">
                            <p className="text-sm font-medium text-foreground">{t(`empty.${scope.type}.title`)}</p>
                            <p className="text-sm leading-relaxed">{t(`empty.${scope.type}.body`)}</p>
                        </div>
                    )}

                    {messages.map((message) => (
                        <Message key={message.id} from={message.role as ComponentProps<typeof Message>['from']}>
                            <MessageContent>
                                {message.parts.map((part, index) => {
                                    if (part.type === 'text') {
                                        return <MessageResponse key={index}>{part.text}</MessageResponse>
                                    }
                                    const p = part as ToolPartLike
                                    if (toolNameOf(p) && p.approval && (p.state === 'approval-requested' || p.state === 'approval-responded' || p.state === 'output-denied')) {
                                        return <ApprovalCard key={index} part={p} onRespond={(id, approved) => addToolApprovalResponse({ id, approved })} />
                                    }
                                    if (toolNameOf(p)) return <ToolLine key={index} part={p} />
                                    return null
                                })}
                            </MessageContent>
                        </Message>
                    ))}

                    {status === 'submitted' && (
                        <Message from="assistant">
                            <MessageContent>
                                <Shimmer className="text-sm">{t('thinking')}</Shimmer>
                            </MessageContent>
                        </Message>
                    )}

                    {error && status === 'error' && setupError && (
                        <AiErrorNotice
                            code={setupError.kind}
                            canConfigure={setupError.canConfigure}
                            settingsUrl={setupError.settingsUrl}
                            audience="teacher"
                        />
                    )}

                    {error && status === 'error' && !setupError && (
                        <div
                            role="alert"
                            className="flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                            data-testid="architect-error"
                        >
                            <span className="min-w-0">{t('error')}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => {
                                    clearError()
                                    void regenerate({ body: { scope, locale } })
                                }}
                            >
                                {t('retry')}
                            </Button>
                        </div>
                    )}
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            <div className="grid shrink-0 gap-3 border-t bg-background pt-3">
                {messages.length === 0 && (
                    <Suggestions className="px-4">
                        {suggestions.map((s) => (
                            <Suggestion key={s} suggestion={s} onClick={(text) => sendMessage({ text })} />
                        ))}
                    </Suggestions>
                )}
                <div className="w-full px-4 pb-4">
                    {messages.length > 0 && (
                        <div className="mb-2 flex justify-end">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-xs text-muted-foreground"
                                disabled={isLoading}
                                onClick={() => setMessages([])}
                            >
                                <IconRotateClockwise2 className="size-3.5" aria-hidden />
                                {t('newChat')}
                            </Button>
                        </div>
                    )}
                    <PromptInput onSubmit={onSubmit}>
                        <PromptInputBody>
                            <PromptInputTextarea
                                placeholder={t('placeholder')}
                                className="min-h-[48px] text-sm"
                                aria-label={t('placeholder')}
                            />
                        </PromptInputBody>
                        <PromptInputFooter>
                            <span />
                            <PromptInputSubmit status={status as ComponentProps<typeof PromptInputSubmit>['status']} />
                        </PromptInputFooter>
                    </PromptInput>
                </div>
            </div>
        </div>
    )
}

export function CourseArchitectChat(props: Props) {
    return (
        <PromptInputProvider>
            <Inner {...props} />
        </PromptInputProvider>
    )
}
