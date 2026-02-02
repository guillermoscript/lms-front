"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { IconRobot, IconCheck, IconRotateClockwise2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
    PromptInputTools
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
    "I need help starting this exercise",
    "Can you explain the instructions?",
    "Is my current answer correct?",
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
        onToolCall: async ({ toolCall }) => {
            if (toolCall.toolName === "markExerciseCompleted") {
                setIsCompleted(true);
                const args = (toolCall as any).args || {};

                // Trigger confetti
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#3b82f6', '#10b981', '#f59e0b']
                });

                toast.success("Exercise Completed!", {
                    description: args.feedback || "Great job!",
                });
                router.refresh();
            }
        },
    });

    const isLoading = status === 'submitted' || status === 'streaming';

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
        if (!confirm("Are you sure you want to restart the conversation? This will clear your chat history.")) return;

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

    return (
        <div className="relative flex flex-col h-[600px] divide-y overflow-hidden bg-background rounded-xl border shadow-sm">
            <Conversation>
                <ConversationContent>
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center min-h-full text-muted-foreground p-8 text-center bg-muted/5">
                            <IconRobot className="h-12 w-12 mb-4 opacity-20" />
                            <h3 className="text-lg font-medium text-foreground mb-2">
                                Hi {profile?.full_name?.split(' ')[0] || 'there'}!
                            </h3>
                            <p className="max-w-xs mx-auto">I'm your AI Coach. I'm here to help you guide through this exercise. How can I assist you today?</p>
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
                                    if (part.type === 'tool-invocation') {
                                        const toolInvocation = (part as any).toolInvocation;
                                        if (toolInvocation && toolInvocation.toolName === 'markExerciseCompleted') {
                                            if (toolInvocation.state === 'result') {
                                                return (
                                                    <div key={toolInvocation.toolCallId} className="mt-4 p-5 bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-2xl text-green-700 dark:text-green-400 text-sm shadow-sm ring-1 ring-inset ring-green-500/10">
                                                        <div className="flex items-start gap-4">
                                                            <div className="p-2 bg-green-500 rounded-lg shadow-lg shadow-green-500/20">
                                                                <IconCheck className="h-5 w-5 text-white" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p className="font-bold text-base text-green-900 dark:text-green-300">Exercise Mastered!</p>
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
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            <div className="grid shrink-0 gap-4 pt-4 bg-background">
                <Suggestions className="px-4">
                    {suggestions.map((suggestion) => (
                        <Suggestion
                            key={suggestion}
                            onClick={() => handleSuggestionClick(suggestion)}
                            suggestion={suggestion}
                        />
                    ))}
                </Suggestions>

                <div className="w-full px-4 pb-4">
                    <PromptInput onSubmit={onSubmit}>
                        <PromptInputBody>
                            <PromptInputTextarea
                                placeholder="Type your response here..."
                                className="min-h-[60px]"
                            />
                        </PromptInputBody>
                        <PromptInputFooter>
                            <PromptInputTools>
                                <div className="flex items-center gap-2">
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

                                    {isCompleted && (
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20 shadow-sm animate-in fade-in zoom-in duration-300">
                                            <IconCheck size={14} className="stroke-[3]" />
                                            <span>Exercise Completed</span>
                                        </div>
                                    )}
                                </div>
                            </PromptInputTools>
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
