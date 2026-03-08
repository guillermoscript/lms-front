'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'
import { toast } from 'sonner'
import { IconRotateClockwise2, IconHistory } from '@tabler/icons-react'
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
import { SessionList } from './session-list'
import { useTranslations } from 'next-intl'

interface AristotleStudyTabProps {
    courseId: number
}

function InnerStudyTab({ courseId }: AristotleStudyTabProps) {
    const [isRestarting, setIsRestarting] = useState(false)
    const [showSessions, setShowSessions] = useState(false)
    const { textInput } = usePromptInputController()
    const t = useTranslations('aristotle')

    const suggestions = [
        t('suggestions.practiceQuiz'),
        t('suggestions.reviewExam'),
        t('suggestions.explainHardest'),
        t('suggestions.studyPlan'),
    ]

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
            },
        }),
    })

    const isLoading = status === 'submitted' || status === 'streaming'

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
        <div className="flex h-[560px] rounded-xl border overflow-hidden bg-background">
            {/* Sessions sidebar (desktop) */}
            <div className={cn(
                'hidden md:flex flex-col w-64 border-r shrink-0',
                showSessions && 'flex'
            )}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('history')}</h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <SessionList courseId={courseId} />
                </div>
            </div>

            {/* Main chat area */}
            <div className="flex flex-col flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
                    <p className="text-sm text-muted-foreground">
                        {isLoading ? t('thinking') : t('studySubtitle')}
                    </p>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground md:hidden"
                            onClick={() => setShowSessions(prev => !prev)}
                            aria-label={t('toggleHistory')}
                        >
                            <IconHistory className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={handleNewSession}
                            disabled={isRestarting || isLoading}
                        >
                            <IconRotateClockwise2 className={cn('h-3 w-3', isRestarting && 'animate-spin')} />
                            {t('newSession')}
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <Conversation>
                    <ConversationContent>
                        {messages.length === 0 && (
                            <div className="flex flex-col items-start p-6 text-muted-foreground">
                                <p className="text-sm leading-relaxed max-w-md">
                                    {t('emptyStudy')}
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
                            {suggestions.map((suggestion) => (
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
        </div>
    )
}

export function AristotleStudyTab({ courseId }: AristotleStudyTabProps) {
    return (
        <PromptInputProvider>
            <InnerStudyTab courseId={courseId} />
        </PromptInputProvider>
    )
}
