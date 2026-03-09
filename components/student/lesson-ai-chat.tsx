"use client";

import {
    Attachment,
    AttachmentPreview,
    AttachmentRemove,
    Attachments,
} from "@/components/ai-elements/attachments";
import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
    Message,
    MessageContent,
    MessageResponse,
} from "@/components/ai-elements/message";
import {
    PromptInput,
    PromptInputBody,
    PromptInputFooter,
    type PromptInputMessage,
    PromptInputSubmit,
    PromptInputTextarea,
    PromptInputTools,
    usePromptInputAttachments,
    PromptInputProvider,
    usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { useChat } from "@ai-sdk/react";
import { IconCheck, IconRobot, IconRotateClockwise2, IconTrophy } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { DefaultChatTransport } from "ai";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
} from "@/components/ai-elements/tool";
import { useTranslations } from "next-intl";

const PromptInputAttachmentsDisplay = () => {
    const attachments = usePromptInputAttachments();

    if (attachments.files.length === 0) {
        return null;
    }

    return (
        <Attachments variant="inline">
            {attachments.files.map((attachment) => (
                <Attachment
                    data={attachment}
                    key={attachment.id}
                    onRemove={() => attachments.remove(attachment.id)}
                >
                    <AttachmentPreview />
                    <AttachmentRemove />
                </Attachment>
            ))}
        </Attachments>
    );
};

interface LessonAIChatProps {
    lessonId: number;
    taskDescription: string;
    isCompleted?: boolean;
    initialMessages?: any[];
}

function InnerLessonAIChat({
    lessonId,
    taskDescription,
    isCompleted: initialIsCompleted,
    initialMessages = [],
}: LessonAIChatProps) {
    const router = useRouter();
    const t = useTranslations('components.lessonAIChat');
    const [isCompleted, setIsCompleted] = useState(initialIsCompleted);
    const [isRestarting, setIsRestarting] = useState(false);
    const { textInput } = usePromptInputController();

    const suggestions = [
        t('suggestions.question'),
        t('suggestions.hint'),
        t('suggestions.understanding'),
        t('suggestions.summarize')
    ];

    const {
        messages,
        status,
        sendMessage,
        setMessages,
    } = useChat({
        transport: new DefaultChatTransport({
            api: "/api/chat/lesson-task",
            body: {
                lessonId,
            },
        }),
        messages: initialMessages,
        onToolCall: async ({ toolCall }) => {
            if (toolCall.toolName === "markLessonCompleted") {
                setIsCompleted(true);
                const args = (toolCall as any).args || {};

                // Trigger confetti
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#3b82f6', '#10b981', '#f59e0b']
                });

                toast.success(t('toast.completed'), {
                    description: args.feedback || t('toast.completedDetail'),
                });
                router.refresh();
            }
        },
    });

    const isLoading = status === 'submitted' || status === 'streaming';

    const onSubmit = (message: PromptInputMessage) => {
        if (!message.text && (!message.files || message.files.length === 0)) return;

        sendMessage({
            text: message.text,
        });
        textInput.clear();
    }

    const handleSuggestionClick = (suggestion: string) => {
        sendMessage({ text: suggestion });
    };

    const handleRestart = async () => {
        if (!confirm(t('confirmRestart'))) return;

        setIsRestarting(true);
        try {
            const res = await fetch("/api/chat/lesson-task/restart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lessonId }),
            });

            if (res.ok) {
                setMessages([]);
                setIsCompleted(false);
                toast.success(t('toast.restartSuccess'));
                router.refresh();
            } else {
                toast.error(t('toast.restartFailed'));
            }
        } catch (error) {
            toast.error(t('toast.restartError'));
        } finally {
            setIsRestarting(false);
        }
    };

    return (
        <div className="relative flex flex-col h-[min(600px,70vh)] sm:h-[600px] divide-y overflow-hidden bg-background sm:rounded-xl sm:border sm:shadow-sm">
            {/* Completion Banner - Positioned at bottom, doesn't block messages */}
            {isCompleted && (
                <div className="absolute bottom-0 left-0 right-0 z-50 p-2 sm:p-4 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
                    <div className="pointer-events-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 space-y-3 sm:space-y-4 animate-in slide-in-from-bottom duration-500">
                        {/* Success Header */}
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="relative shrink-0">
                                <div className="absolute inset-0 bg-white rounded-full blur-lg opacity-30 animate-pulse"></div>
                                <div className="relative p-2 sm:p-3 bg-white/20 backdrop-blur-sm rounded-full border-2 border-white/30">
                                    <IconCheck className="h-6 w-6 sm:h-8 sm:w-8 text-white stroke-[3]" />
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base sm:text-xl font-bold text-white">
                                    {t('successHeader')} 🎉
                                </h3>
                                <p className="text-white/90 text-xs sm:text-sm">
                                    {t('successDescription')}
                                </p>
                            </div>
                        </div>

                        {/* Stats + Action in a row on mobile */}
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-3 border border-white/20 text-center">
                                <div className="text-lg sm:text-2xl font-bold text-white">
                                    {messages.length}
                                </div>
                                <div className="text-[10px] sm:text-xs text-white/80">
                                    {t('stats.messages')}
                                </div>
                            </div>
                            <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-3 border border-white/20 text-center">
                                <div className="text-lg sm:text-2xl font-bold text-white flex items-center justify-center">
                                    <IconTrophy className="h-5 w-5 sm:h-6 sm:w-6" />
                                </div>
                                <div className="text-[10px] sm:text-xs text-white/80">
                                    {t('stats.taskCompleted')}
                                </div>
                            </div>
                            <Button
                                onClick={handleRestart}
                                disabled={isRestarting}
                                variant="secondary"
                                className="flex-1 h-full min-h-[52px] sm:min-h-[60px] bg-white text-green-600 hover:bg-white/90 font-semibold text-xs sm:text-sm rounded-lg"
                            >
                                {isRestarting ? (
                                    <IconRotateClockwise2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <div className="flex flex-col items-center gap-0.5">
                                        <IconRotateClockwise2 className="h-4 w-4" />
                                        <span>{t('buttons.tryAgain')}</span>
                                    </div>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <Conversation>
                <ConversationContent className={`gap-4 sm:gap-8 p-3 sm:p-4 ${isCompleted ? "pb-48 sm:pb-64" : ""}`}>
                    {messages.length === 0 && !isCompleted && (
                        <div className="flex flex-col items-center justify-center min-h-full text-muted-foreground p-1 sm:p-6 text-center">
                            <IconRobot className="h-8 w-8 sm:h-12 sm:w-12 mb-2 sm:mb-4 opacity-20" />
                            <h3 className="text-sm sm:text-lg font-medium text-foreground mb-1 sm:mb-2">{t('emptyState.title')}</h3>
                            <p className="max-w-xs mx-auto text-xs sm:text-sm">{t('emptyState.description')}</p>
                        </div>
                    )}

                    {messages.map((message) => (
                        <Message key={message.id} from={message.role as any}>
                            <MessageContent>
                                {message.parts.map((part, index) => {
                                    if (part.type === 'text') {
                                        return <MessageResponse key={index}>{part.text}</MessageResponse>;
                                    }
                                    if (part.type === 'tool-invocation') {
                                        const toolInvocation = (part as any).toolInvocation;
                                        if (!toolInvocation) return null;

                                        // Special handling for markLessonCompleted
                                        if (toolInvocation.toolName === 'markLessonCompleted') {
                                            if (toolInvocation.state === 'result') {
                                                return (
                                                    <div key={toolInvocation.toolCallId} className="mt-3 sm:mt-4 p-3 sm:p-5 bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-xl sm:rounded-2xl text-green-700 dark:text-green-400 text-sm shadow-sm ring-1 ring-inset ring-green-500/10">
                                                        <div className="flex items-start gap-3 sm:gap-4">
                                                            <div className="p-2 bg-green-500 rounded-lg shadow-lg shadow-green-500/20">
                                                                <IconCheck className="h-5 w-5 text-white" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p className="font-bold text-base text-green-900 dark:text-green-300">{t('targetAchieved')}</p>
                                                                <p className="opacity-90 leading-relaxed text-sm">{(toolInvocation.result as any).feedback}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            return null;
                                        }

                                        // Generic Tool Handling
                                        const state = toolInvocation.state === 'result' ? 'output-available' : 'input-available';

                                        return (
                                            <Tool key={toolInvocation.toolCallId} defaultOpen={state === 'output-available'}>
                                                <ToolHeader
                                                    type="dynamic-tool"
                                                    toolName={toolInvocation.toolName}
                                                    state={state}
                                                />
                                                <ToolContent>
                                                    <ToolInput input={toolInvocation.args} />
                                                    <ToolOutput
                                                        output={toolInvocation.result}
                                                        errorText={undefined}
                                                    />
                                                </ToolContent>
                                            </Tool>
                                        );
                                    }
                                    return null;
                                })}
                            </MessageContent>
                        </Message>
                    ))}
                    {
                        status === 'submitted' && (
                            <Message
                                from='assistant'
                            >
                                <MessageContent>
                                    <Shimmer className="text-sm">{t('generating')}</Shimmer>
                                </MessageContent>
                            </Message>
                        )
                    }
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            <div className="grid shrink-0 gap-2 sm:gap-3 pt-2 sm:pt-3 bg-background">
                {!isCompleted && (
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

                <div className="w-full px-3 pb-3 sm:px-4 sm:pb-4">
                    <PromptInput
                        onSubmit={onSubmit}
                        className="w-full"
                    >
                        <div className="px-3 pt-2 sm:pt-3">
                            <PromptInputAttachmentsDisplay />
                        </div>
                        <PromptInputBody>
                            <PromptInputTextarea
                                placeholder={isCompleted ? t('placeholders.completed') : t('placeholders.typeAnswer')}
                                disabled={isCompleted}
                            />
                        </PromptInputBody>
                        <PromptInputFooter>
                            <PromptInputTools>
                                <div className="flex items-center gap-2">
                                    {!isCompleted && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8 rounded-full shadow-sm hover:shadow active:scale-95 transition-all text-muted-foreground hover:text-primary hover:border-primary/30"
                                            onClick={handleRestart}
                                            disabled={isRestarting || isLoading}
                                            title={t('tooltips.restart')}
                                            aria-label={t('tooltips.restart')}
                                        >
                                            <IconRotateClockwise2 className={`h-4 w-4 ${isRestarting ? 'animate-spin' : ''}`} />
                                        </Button>
                                    )}

                                    {isCompleted && (
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20 shadow-sm animate-in fade-in zoom-in duration-300">
                                            <IconCheck size={14} className="stroke-[3]" />
                                            <span>{t('successHeader')}</span>
                                        </div>
                                    )}
                                </div>
                            </PromptInputTools>
                            {!isCompleted && <PromptInputSubmit status={status as any} />}
                        </PromptInputFooter>
                    </PromptInput>
                </div>
            </div>
        </div>
    );
}

export function LessonAIChat(props: LessonAIChatProps) {
    return (
        <PromptInputProvider>
            <InnerLessonAIChat {...props} />
        </PromptInputProvider>
    );
}
