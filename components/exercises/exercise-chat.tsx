"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect } from "react";
import { IconRobot, IconCheck, IconRotateClockwise2, IconSparkles } from "@tabler/icons-react";
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
    type PromptInputMessage,
    PromptInputProvider,
    usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { DefaultChatTransport } from "ai";

interface ExerciseChatProps {
    apiEndpoint: string;
    exerciseId: string;
    initialMessages: any[];
    isExerciseCompleted: boolean;
    profile: any;
}

const suggestions = [
    "Help me get started",
    "Explain the instructions",
    "Check my answer",
    "Give me a hint"
];

function InnerExerciseChat({
    apiEndpoint,
    exerciseId,
    initialMessages,
    isExerciseCompleted: initialCompleted,
    profile,
}: ExerciseChatProps) {
    const router = useRouter();
    const tGamification = useTranslations("gamification");
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
                (part: any) => part.type === 'tool-markExerciseCompleted' && part.state === 'output-available'
            );
            
            if (completionPart && !isCompleted) {
                setIsCompleted(true);
                const feedback = (completionPart as any).output?.feedback || "Great job!";

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
    }, [messages, isCompleted, router]);

    const onSubmit = (message: PromptInputMessage) => {
        if (!message.text) return;
        sendMessage({
            text: message.text,
        });
        textInput.clear();
    };

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
        } catch (error) {
            toast.error("Error restarting chat");
        } finally {
            setIsRestarting(false);
        }
    };

    const firstName = profile?.full_name?.split(' ')[0] || 'there';

    return (
        <div className="relative flex flex-col h-[min(500px,65vh)] sm:h-[600px] md:h-[650px] overflow-hidden bg-background rounded-xl sm:rounded-2xl border sm:border-2 shadow-sm">
            {/* Chat Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2 sm:gap-2.5">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-primary/10">
                        <IconSparkles size={14} className="sm:size-4 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                        <h3 className="text-xs sm:text-sm font-bold leading-none">AI Coach</h3>
                        <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                            {isLoading ? "Thinking..." : "Ready to help"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    {isCompleted && (
                        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-emerald-500/20">
                            <IconCheck size={10} className="sm:size-3 stroke-[3]" aria-hidden="true" />
                            <span className="hidden sm:inline">Completed</span>
                            <span className="sm:hidden">Done</span>
                        </div>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                        onClick={handleRestart}
                        disabled={isRestarting || isLoading}
                        aria-label="Restart conversation"
                    >
                        <IconRotateClockwise2 className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isRestarting ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Messages Area */}
            <Conversation>
                <ConversationContent className="gap-4 sm:gap-8 p-3 sm:p-4">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center min-h-full text-muted-foreground p-1 sm:p-4 md:p-6 text-center">
                            <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center mb-2 sm:mb-4">
                                <IconRobot className="h-5 w-5 sm:h-7 sm:w-7 text-primary/60" aria-hidden="true" />
                            </div>
                            <h3 className="text-sm sm:text-lg font-bold text-foreground mb-1 sm:mb-1.5">
                                Hi {firstName}!
                            </h3>
                            <p className="max-w-sm mx-auto text-xs sm:text-sm leading-relaxed">
                                I&rsquo;m your AI Coach. I&rsquo;ll guide you through this exercise, provide hints, and evaluate your work. Start by asking a question or use a suggestion below.
                            </p>
                        </div>
                    )}

                    {messages.filter((m) => m.role !== 'system').map((message) => (
                        <Message
                            key={message.id}
                            from={message.role as any}
                        >
                            <MessageContent>
                                {message.parts.map((part, index) => {
                                    if (part.type === 'text') {
                                        return <MessageResponse key={index}>{part.text}</MessageResponse>;
                                    }
                                    // Handle tool invocation parts with proper type checking
                                    if (part.type === 'tool-markExerciseCompleted') {
                                        if (part.state === 'output-available') {
                                            return (
                                                <div key={part.toolCallId} className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm">
                                                    <div className="flex items-start gap-2 sm:gap-3">
                                                        <div className="p-1 sm:p-1.5 bg-emerald-500 rounded-lg shrink-0">
                                                            <IconCheck className="h-3 w-3 sm:h-4 sm:w-4 text-white" aria-hidden="true" />
                                                        </div>
                                                        <div className="space-y-0.5 sm:space-y-1 min-w-0">
                                                            <p className="font-bold text-emerald-900 dark:text-emerald-300 text-sm sm:text-base">Exercise Mastered!</p>
                                                            <p className="opacity-90 leading-relaxed">{(part.output as any).feedback}</p>
                                                        </div>
                                                    </div>
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
                    <PromptInput onSubmit={onSubmit}>
                        <PromptInputBody>
                            <PromptInputTextarea
                                placeholder="Type your response..."
                            />
                        </PromptInputBody>
                        <PromptInputFooter>
                            <PromptInputSubmit status={status as any} />
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
