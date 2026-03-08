'use client'

import { useAristotle, useAristotleOptional } from './aristotle-provider'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { IconX, IconRotateClockwise2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
    Message,
    MessageContent,
    MessageResponse,
} from '@/components/ai-elements/message'
import {
    PromptInput,
    PromptInputBody,
    PromptInputFooter,
    PromptInputSubmit,
    PromptInputTextarea,
    type PromptInputMessage,
    PromptInputProvider,
    usePromptInputController,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { useTranslations } from 'next-intl'

function InnerAristotlePanel() {
    const { isOpen, close, courseId, contextPage, contextLabel, personaName } = useAristotle()
    const [isRestarting, setIsRestarting] = useState(false)
    const { textInput } = usePromptInputController()
    const t = useTranslations('aristotle')

    // Close on Escape
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) close()
    }, [isOpen, close])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    // Prevent body scroll when panel is open on mobile
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [isOpen])

    const contextSuggestions = contextPage?.includes('/lessons/')
        ? [t('suggestions.explainConcept'), t('suggestions.practiceThis'), t('suggestions.connectCourse')]
        : contextPage?.includes('/exercises/')
            ? [t('suggestions.guideMe'), t('suggestions.explainApproach'), t('suggestions.whatConcept')]
            : [t('suggestions.studyNext'), t('suggestions.practiceQuiz'), t('suggestions.summarizeLearned')]

    const {
        messages,
        status,
        sendMessage,
        setMessages,
    } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat/aristotle',
            body: {
                courseId: String(courseId),
                contextPage,
            },
        }),
    })

    const isLoading = status === 'submitted' || status === 'streaming'
    const displayName = personaName || t('name')

    const onSubmit = (message: PromptInputMessage) => {
        if (!message.text) return
        sendMessage({ text: message.text })
        textInput.clear()
    }

    const handleSuggestionClick = (suggestion: string) => {
        sendMessage({ text: suggestion })
    }

    const handleNewSession = async () => {
        setIsRestarting(true)
        try {
            const res = await fetch('/api/chat/aristotle/restart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId: String(courseId) }),
            })
            if (res.ok) {
                setMessages([])
                toast.success(t('toast.newSession'))
            } else {
                toast.error(t('toast.newSessionFailed'))
            }
        } catch {
            toast.error(t('toast.newSessionError'))
        } finally {
            setIsRestarting(false)
        }
    }

    return (
        <>
            {/* Overlay — mobile only */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent sm:pointer-events-none transition-opacity"
                    onClick={close}
                    aria-hidden
                />
            )}

            <div
                className={cn(
                    'fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] border-l bg-background shadow-2xl transition-transform duration-200 ease-out flex flex-col',
                    isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                )}
                role="dialog"
                aria-label={displayName}
                aria-hidden={!isOpen}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl leading-none" aria-hidden>&#966;</span>
                        <div>
                            <h3 className="text-sm font-semibold leading-none">{displayName}</h3>
                            {contextLabel ? (
                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[220px]">
                                    {contextLabel}
                                </p>
                            ) : (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {isLoading ? t('thinking') : t('subtitle')}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={handleNewSession}
                            disabled={isRestarting || isLoading}
                            aria-label={t('newSession')}
                        >
                            <IconRotateClockwise2 className={cn('h-3.5 w-3.5', isRestarting && 'animate-spin')} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={close}
                            aria-label={t('close')}
                        >
                            <IconX className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <Conversation>
                    <ConversationContent>
                        {messages.length === 0 && (
                            <div className="flex flex-col items-start p-6 text-muted-foreground">
                                <p className="text-sm leading-relaxed">
                                    {t('emptyPanel')}
                                </p>
                            </div>
                        )}

                        {messages.map((message) => (
                            <Message key={message.id} from={message.role as any}>
                                <MessageContent>
                                    {message.parts.map((part, index) => {
                                        if (part.type === 'text') {
                                            return <MessageResponse key={index}>{part.text}</MessageResponse>
                                        }
                                        return null
                                    })}
                                </MessageContent>
                            </Message>
                        ))}

                        {status === 'streaming' && (
                            <Message from="assistant">
                                <MessageContent>
                                    <Shimmer className="text-sm">{t('thinking')}</Shimmer>
                                </MessageContent>
                            </Message>
                        )}
                    </ConversationContent>
                    <ConversationScrollButton />
                </Conversation>

                {/* Input */}
                <div className="grid shrink-0 gap-3 pt-3 bg-background border-t">
                    {messages.length === 0 && (
                        <Suggestions className="px-4">
                            {contextSuggestions.map((suggestion) => (
                                <Suggestion
                                    key={suggestion}
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    suggestion={suggestion}
                                />
                            ))}
                        </Suggestions>
                    )}

                    <div className="w-full px-4 pb-4">
                        <PromptInput onSubmit={onSubmit}>
                            <PromptInputBody>
                                <PromptInputTextarea
                                    placeholder={t('placeholder')}
                                    className="min-h-[48px] text-sm"
                                />
                            </PromptInputBody>
                            <PromptInputFooter>
                                <PromptInputSubmit status={status as any} />
                            </PromptInputFooter>
                        </PromptInput>
                    </div>
                </div>
            </div>
        </>
    )
}

export function AristotlePanel() {
    const aristotle = useAristotleOptional()
    if (!aristotle?.isEnabled) return null

    return (
        <PromptInputProvider>
            <InnerAristotlePanel />
        </PromptInputProvider>
    )
}
