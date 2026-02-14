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
import { Skeleton } from "../ui/skeleton";

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

const suggestions = [
    "I have a question about the task",
    "Can you give me a hint?",
    "Check my understanding",
    "Summarize what I've learned"
];

function InnerLessonAIChat({
    lessonId,
    taskDescription,
    isCompleted: initialIsCompleted,
    initialMessages = [],
}: LessonAIChatProps) {
    const router = useRouter();
    const [isCompleted, setIsCompleted] = useState(initialIsCompleted);
    const [isRestarting, setIsRestarting] = useState(false);
    const { textInput } = usePromptInputController();

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

                toast.success("Lesson Completed!", {
                    description: args.feedback || "Great job! You have successfully completed the task.",
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
        if (!confirm("Are you sure you want to restart the conversation? This will clear your chat history and reset completion status.")) return;

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
                toast.success("Chat restarted successfully");
                router.refresh();
            } else {
                toast.error("Failed to restart chat");
            }
        } catch (error) {
            toast.error("Error restarting chat");
        } finally {
            setIsRestarting(false);
        }
    };

    return (
        <div className="relative flex flex-col h-[600px] divide-y overflow-hidden bg-background rounded-xl border shadow-sm">
            {/* Completion Banner - Positioned at bottom, doesn't block messages */}
            {isCompleted && (
                <div className="absolute bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
                    <div className="pointer-events-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom duration-500">
                        {/* Success Header */}
                        <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                                <div className="absolute inset-0 bg-white rounded-full blur-lg opacity-30 animate-pulse"></div>
                                <div className="relative p-3 bg-white/20 backdrop-blur-sm rounded-full border-2 border-white/30">
                                    <IconCheck className="h-8 w-8 text-white stroke-[3]" />
                                </div>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-white">
                                    Lesson Completed! 🎉
                                </h3>
                                <p className="text-white/90 text-sm">
                                    Great job! You've successfully completed this task.
                                </p>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                                <div className="text-2xl font-bold text-white">
                                    {messages.length}
                                </div>
                                <div className="text-xs text-white/80">
                                    Messages Exchanged
                                </div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                                <div className="text-2xl font-bold text-white flex items-center justify-center">
                                    <IconTrophy className="h-6 w-6" />
                                </div>
                                <div className="text-xs text-white/80">
                                    Task Completed
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <Button
                                onClick={handleRestart}
                                disabled={isRestarting}
                                variant="secondary"
                                className="flex-1 h-10 bg-white text-green-600 hover:bg-white/90 font-semibold"
                            >
                                {isRestarting ? (
                                    <>
                                        <IconRotateClockwise2 className="mr-2 h-4 w-4 animate-spin" />
                                        Restarting...
                                    </>
                                ) : (
                                    <>
                                        <IconRotateClockwise2 className="mr-2 h-4 w-4" />
                                        Try Again
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <Conversation>
                <ConversationContent className={isCompleted ? "pb-64" : ""}>
                    {messages.length === 0 && !isCompleted && (
                        <div className="flex flex-col items-center justify-center min-h-full text-muted-foreground p-8 text-center bg-muted/5">
                            <IconRobot className="h-12 w-12 mb-4 opacity-20" />
                            <h3 className="text-lg font-medium text-foreground mb-2">AI Tutor Ready</h3>
                            <p className="max-w-xs mx-auto">I'm ready to review your work! Type your answer below based on the task description.</p>
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
                                        if (toolInvocation && toolInvocation.toolName === 'markLessonCompleted') {
                                            if (toolInvocation.state === 'result') {
                                                return (
                                                    <div key={toolInvocation.toolCallId} className="mt-4 p-5 bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-2xl text-green-700 dark:text-green-400 text-sm shadow-sm ring-1 ring-inset ring-green-500/10">
                                                        <div className="flex items-start gap-4">
                                                            <div className="p-2 bg-green-500 rounded-lg shadow-lg shadow-green-500/20">
                                                                <IconCheck className="h-5 w-5 text-white" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p className="font-bold text-base text-green-900 dark:text-green-300">Target Achieved!</p>
                                                                <p className="opacity-90 leading-relaxed text-sm">{(toolInvocation.result as any).feedback}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }
                                        }
                                    }
                                    return null;
                                })}
                            </MessageContent>
                        </Message>
                    ))}
                    {
                        status === 'streaming' && (
                            <Message
                                from='assistant'
                            >
                                <MessageContent>
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-4 w-full" />
                                </MessageContent>
                            </Message>
                        )
                    }
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            <div className="grid shrink-0 gap-4 pt-4 bg-background">
                {!isCompleted && (
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
                    <PromptInput
                        onSubmit={onSubmit}
                        className="w-full"
                    >
                        <div className="px-3 pt-3">
                            <PromptInputAttachmentsDisplay />
                        </div>
                        <PromptInputBody>
                            <PromptInputTextarea
                                placeholder={isCompleted ? "Lesson completed! Restart to continue practicing." : "Type your answer here..."}
                                className="min-h-[60px]"
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
                                            title="Restart Conversation"
                                        >
                                            <IconRotateClockwise2 className={`h-4 w-4 ${isRestarting ? 'animate-spin' : ''}`} />
                                        </Button>
                                    )}

                                    {isCompleted && (
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20 shadow-sm animate-in fade-in zoom-in duration-300">
                                            <IconCheck size={14} className="stroke-[3]" />
                                            <span>Lesson Completed</span>
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
