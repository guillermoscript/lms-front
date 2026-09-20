"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect } from "react";
import { IconCheck, IconRotateClockwise2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import {
    Conversation,
    ConversationContent,
    ConversationScrollButton
} from "@/components/ai-elements/conversation";
import {
    Message,
    MessageContent,
    MessageResponse
} from "@/components/ai-elements/message";
import {
    PromptInput,
    PromptInputBody,
    PromptInputFooter,
    PromptInputTextarea,
    PromptInputSubmit,
    PromptInputTools,
    PromptInputProvider,
    usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
    ChatAttachButton,
    ChatAttachmentsPreview,
    MessageImageParts,
    useChatAttachmentInputProps,
} from "@/components/ai/chat-attachments";
import { useAiChatSubmit } from "@/hooks/use-ai-chat-submit";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ComponentProps } from "react";

interface ExerciseChatProps {
    apiEndpoint: string;
    exerciseId: string;
    initialMessages: UIMessage[];
    isExerciseCompleted: boolean;
    profile: { full_name?: string | null } | null;
}

const SUGGESTION_KEYS = ['start', 'explain', 'check', 'hint'] as const;

function InnerExerciseChat({
    apiEndpoint,
    exerciseId,
    initialMessages,
    isExerciseCompleted: initialCompleted,
}: ExerciseChatProps) {
    const router = useRouter();
    const tGamification = useTranslations("gamification");
    const t = useTranslations("exercises.coach");
    const suggestions = SUGGESTION_KEYS.map((key) => t(`suggestions.${key}`));
    const [isCompleted, setIsCompleted] = useState(initialCompleted);
    const [isRestarting, setIsRestarting] = useState(false);
    const { textInput } = usePromptInputController();

    const {
        messages,
        status,
        sendMessage,
        setMessages,
    } = useChat({
        transport: new DefaultChatTransport({
            api: apiEndpoint,
            body: {
                exerciseId,
            },
        }),
        messages: initialMessages,
    });

    const isLoading = status === 'submitted' || status === 'streaming';

    // Watch for exercise completion tool invocation
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant') {
            const completionPart = lastMessage.parts.find(
                (part) => part.type === 'tool-markExerciseCompleted' && part.state === 'output-available'
            ) as { output?: { feedback?: string } } | undefined;

            if (completionPart && !isCompleted) {
                // Reacting to an external stream event (the tool result), not deriving state.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setIsCompleted(true);
                const feedback = completionPart.output?.feedback || "Great job!";

                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#3b82f6', '#10b981', '#f59e0b']
                });

                toast.success("Exercise Completed!", {
                    description: feedback,
                });
                toast.success(tGamification("xpAwarded.exercise_completion"));
                router.refresh();
            }
        }
    }, [messages, isCompleted, router, tGamification]);

    const attachmentInputProps = useChatAttachmentInputProps();
    const onSubmit = useAiChatSubmit({ sendMessage, clearInput: textInput.clear });

    const handleSuggestionClick = (suggestion: string) => {
        sendMessage({ text: suggestion });
    };

    const handleRestart = async () => {
        if (!confirm("Are you sure you want to restart? This will clear your chat history.")) return;

        setIsRestarting(true);
        try {
            const res = await fetch("/api/chat/exercises/student/restart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ exerciseId }),
            });

            if (res.ok) {
                setMessages([]);
                toast.success("Chat restarted");
            } else {
                toast.error("Failed to restart chat");
            }
        } catch {
            toast.error("Error restarting chat");
        } finally {
            setIsRestarting(false);
        }
    };

    return (
        // Flat, like every other surface on the page: it used to be the one
        // element with a 2px border and a shadow.
        <div className="relative flex h-[min(500px,65vh)] flex-col overflow-hidden rounded-card bg-card ring-1 ring-foreground/10 sm:h-[600px] md:h-[650px]">
            {/* Chat Header */}
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-tight">{t('title')}</h3>
                    <p className="text-sm text-muted-foreground" role="status">
                        {isLoading ? t('thinking') : t('ready')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isCompleted && (
                        <span className="flex items-center gap-1 text-sm font-medium text-success">
                            <IconCheck size={14} aria-hidden="true" />
                            {t('completed')}
                        </span>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-muted-foreground hover:text-foreground"
                        onClick={handleRestart}
                        disabled={isRestarting || isLoading}
                        aria-label={t('restart')}
                    >
                        <IconRotateClockwise2
                            className={`h-4 w-4 ${isRestarting ? 'animate-spin motion-reduce:animate-none' : ''}`}
                            aria-hidden="true"
                        />
                    </Button>
                </div>
            </div>

            {/* Messages Area */}
            <Conversation>
                <ConversationContent className="gap-4 sm:gap-8 p-3 sm:p-4">
                    {messages.length === 0 && (
                        // Says what the box is for. It used to be a robot tile
                        // and a "Hi {name}!" over a paragraph about itself.
                        <div className="flex min-h-full flex-col items-center justify-center p-4 text-center">
                            <p className="max-w-sm text-base font-medium">{t('emptyTitle')}</p>
                            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                                {t('emptyBody')}
                            </p>
                        </div>
                    )}

                    {messages.filter((m) => m.role !== 'system').map((message) => (
                        <Message
                            key={message.id}
                            from={message.role as ComponentProps<typeof Message>['from']}
                        >
                            <MessageContent>
                                <MessageImageParts parts={message.parts} />
                                {message.parts.map((part, index) => {
                                    if (part.type === 'text') {
                                        return <MessageResponse key={index}>{part.text}</MessageResponse>;
                                    }
                                    // Handle tool invocation parts with proper type checking
                                    if (part.type === 'tool-markExerciseCompleted') {
                                        if (part.state === 'output-available') {
                                            return (
                                                <div key={part.toolCallId} className="mt-4 border-t pt-3 text-sm">
                                                    <p className="flex items-center gap-1.5 font-semibold text-success">
                                                        <IconCheck size={16} aria-hidden="true" />
                                                        {t('markedComplete')}
                                                    </p>
                                                    <p className="mt-1 leading-relaxed">
                                                        {(part.output as { feedback?: string } | undefined)?.feedback}
                                                    </p>
                                                </div>
                                            )
                                        }
                                    }
                                    return null;
                                })}
                            </MessageContent>
                        </Message>
                    ))}
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            {/* Input Area */}
            <div className="grid shrink-0 gap-2 sm:gap-3 pt-2 sm:pt-3 bg-background border-t">
                {messages.length === 0 && (
                    <Suggestions className="px-3 sm:px-4">
                        {suggestions.map((suggestion) => (
                            <Suggestion
                                key={suggestion}
                                onClick={() => handleSuggestionClick(suggestion)}
                                suggestion={suggestion}
                            />
                        ))}
                    </Suggestions>
                )}

                <div className="w-full px-3 sm:px-4 pb-3 sm:pb-4">
                    <PromptInput onSubmit={onSubmit} {...attachmentInputProps}>
                        <ChatAttachmentsPreview />
                        <PromptInputBody>
                            <PromptInputTextarea
                                placeholder={t('placeholder')}
                            />
                        </PromptInputBody>
                        <PromptInputFooter>
                            <PromptInputTools>
                                <ChatAttachButton disabled={isLoading} />
                            </PromptInputTools>
                            <PromptInputSubmit status={status as ComponentProps<typeof PromptInputSubmit>['status']} />
                        </PromptInputFooter>
                    </PromptInput>
                </div>
            </div>
        </div>
    );
}

export default function ExerciseChat(props: ExerciseChatProps) {
    return (
        <PromptInputProvider>
            <InnerExerciseChat {...props} />
        </PromptInputProvider>
    );
}
