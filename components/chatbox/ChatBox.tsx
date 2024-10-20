'use client'

import { generateId } from 'ai'
import { useChat } from 'ai/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Loader2,
    MessageSquare,
    Search,
    Send,
    X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCopyToClipboard } from 'usehooks-ts'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

import ChatLoadingSkeleton from '../dashboards/chat/ChatLoadingSkeleton'
import MessageItem from '../dashboards/Common/chat/MesssageItem'
import { Input } from '../ui/input'
import WebSearchResult from './WebSearchResult'
// Assuming you have a Separator component

interface ChatBoxProps {
    instructions: string
    profile: {
        avatar_url: string
        full_name: string
    }
}

export default function ChatBox({ instructions, profile }: ChatBoxProps) {
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
    const [editedContent, setEditedContent] = useState<string>('')
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const chatBoxRef = useRef<HTMLDivElement>(null)
    const t = useScopedI18n('ChatBox')
    const [copiedText, copy] = useCopyToClipboard()
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        setMessages,
        append,
        reload,
    } = useChat({
        api: '/api/chatbox-ai',
        initialMessages: [
            {
                id: generateId(),
                content: instructions,
                role: 'system',
            },
        ],
        async onToolCall({ toolCall }) {
            console.log('Tool call:', toolCall)
            // if (toolCall.toolName === 'provideHint') {
            //     console.log('Hint:', toolCall)
            // }
        },
        maxSteps: 3,
    })

    const quickAccessButtons = [
        {
            label: 'searchWeb',
            icon: '🔍',
        },
        {
            label: 'getQuestions',
            icon: '❓',
        },
    ]

    const toggleChat = () => setIsChatOpen((prev) => !prev)
    const toggleExpand = () => setIsExpanded((prev) => !prev)

    const scrollToBottom = () => {
        if (scrollAreaRef.current) {
            const scrollElement = scrollAreaRef.current.querySelector(
                '[data-radix-scroll-area-viewport]'
            )
            if (scrollElement) {
                scrollElement.scrollTop = scrollElement.scrollHeight
            }
        }
    }

    useEffect(() => {
        if (isChatOpen) {
            scrollToBottom()
        }
    }, [isChatOpen, messages])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                chatBoxRef.current &&
                !chatBoxRef.current.contains(event.target as Node)
            ) {
                setIsChatOpen(false)
                setIsExpanded(false)
                setEditingMessageId(null) // Reset editing state
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    const handleQuickAccess = (question: string) => {
        append({
            content: question,
            role: 'user',
        })
    }

    // Handlers for editing messages
    const handleEdit = (id: string, currentContent: string) => {
        setEditingMessageId(id)
        setEditedContent(currentContent)
        // get the message to be edited
        const message = messages.find((m) => m.id === id)
        if (message) {
            setEditedContent(message.content)
        }

        // remove all the next messasges to the one being edited
        const index = messages.findIndex((m) => m.id === id)
        const updatedMessages = messages.slice(0, index + 1)
        setMessages(updatedMessages)

        append({
            id,
            content: currentContent,
            role: 'user', // Adjust role if necessary
        })
    }

    const handleSave = async (id: string) => {
        // Implement your save logic here, e.g., API call to save edited message
        append({
            id,
            content: editedContent,
            role: 'user', // Adjust role if necessary
            // Add other necessary fields
        })
        setEditingMessageId(null)
        setEditedContent('')
    }

    const handleDelete = async (id: string) => {
        // delete the message from the chat
        const messageIndex = messages.findIndex((m) => m.id === id)
        const updatedMessages = [...messages]
        updatedMessages.splice(messageIndex, 1)
        setMessages(updatedMessages)
    }

    const handleCopy = (content: string) => {
        copy(content)
        toast.success(t('copied'))
    }

    const handleRegenerate = (id: string) => {
        // Implement your regenerate logic here
        // delete the message after regenerating
        const messageIndex = messages.findIndex((m) => m.id === id)
        const updatedMessages = [...messages]
        updatedMessages.splice(messageIndex, 1)
        setMessages(updatedMessages)
        reload()
    }

    return (
        <>
            <Button
                size="icon"
                variant="outline"
                className="fixed bottom-5 right-5 w-12 h-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 z-10"
                onClick={toggleChat}
            >
                <MessageSquare className="h-6 w-6" />
                <span className="sr-only">
                    {isChatOpen ? t('closeChat') : t('openChat')}
                </span>
            </Button>

            <AnimatePresence>
                {isChatOpen && (
                    <motion.div
                        ref={chatBoxRef}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className={`fixed ${
                            isExpanded
                                ? 'inset-4'
                                : 'bottom-20 right-5 w-[350px] h-[500px]'
                        } z-40`}
                    >
                        <Card className="w-full h-full shadow-xl overflow-hidden flex flex-col">
                            <CardHeader className="flex flex-row items-center justify-between p-4 flex-shrink-0 bg-primary text-primary-foreground">
                                <CardTitle className="text-lg font-semibold">
                                    {t('chatAssistant')}
                                </CardTitle>
                                <div className="flex items-center space-x-2">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={toggleExpand}
                                    >
                                        {isExpanded ? (
                                            <ChevronDown className="h-4 w-4" />
                                        ) : (
                                            <ChevronUp className="h-4 w-4" />
                                        )}
                                        <span className="sr-only">
                                            {isExpanded
                                                ? t('minimize')
                                                : t('expand')}
                                        </span>
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={toggleChat}
                                    >
                                        <X className="h-4 w-4" />
                                        <span className="sr-only">
                                            {t('closeChat')}
                                        </span>
                                    </Button>
                                </div>
                            </CardHeader>

                            <CardContent className="p-0 flex-grow overflow-hidden">
                                <ScrollArea
                                    className="h-full"
                                    ref={scrollAreaRef}
                                >
                                    <div className="p-4 space-y-4">
                                        {messages.length === 1 ? (
                                            <>
                                                <p className="text-sm text-muted-foreground text-center py-4">
                                                    {t('greeting')}
                                                </p>
                                                <div className="grid grid-cols-2 gap-2 mt-4">
                                                    {quickAccessButtons.map(
                                                        (button, index) => (
                                                            <Button
                                                                key={index}
                                                                variant="outline"
                                                                className="text-left"
                                                                onClick={() =>
                                                                    handleQuickAccess(
                                                                        t(
                                                                            `quickAccess.${button.label}.text`
                                                                        )
                                                                    )
                                                                }
                                                            >
                                                                <span className="mr-2">
                                                                    {
                                                                        button.icon
                                                                    }
                                                                </span>
                                                                {t(
                                                                    `quickAccess.${button.label}.title`
                                                                )}
                                                            </Button>
                                                        )
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            messages.map((message) => {
                                                if (message.role === 'system') {
                                                    return null
                                                }

                                                return (
                                                    <MessageItem
                                                        key={message.id}
                                                        message={message}
                                                        profile={profile}
                                                        isEditing={
                                                            editingMessageId ===
                                                            message.id
                                                        }
                                                        editedContent={
                                                            editedContent
                                                        }
                                                        setEditedContent={
                                                            setEditedContent
                                                        }
                                                        onEdit={() =>
                                                            handleEdit(
                                                                message.id,
                                                                message.content
                                                            )
                                                        }
                                                        onSave={async () =>
                                                            await handleSave(
                                                                message.id
                                                            )
                                                        }
                                                        onDelete={async () =>
                                                            await handleDelete(
                                                                message.id
                                                            )
                                                        }
                                                        onCopy={() =>
                                                            handleCopy(
                                                                message.content
                                                            )
                                                        }
                                                        onRegenerate={() =>
                                                            handleRegenerate(
                                                                message.id
                                                            )
                                                        }
                                                        isLoading={isLoading}
                                                        isCompleted={false}
                                                        toolInvocations={
                                                            <>
                                                                {message?.toolInvocations?.map(
                                                                    (tool) => {
                                                                        if (
                                                                            tool.toolName ===
                                                                                'tavily_web_search' &&
                                                                            'result' in
                                                                                tool
                                                                        ) {
                                                                            return (
                                                                                <WebSearchResult
                                                                                    key={
                                                                                        tool.toolCallId
                                                                                    }
                                                                                    toolName={
                                                                                        tool.toolName
                                                                                    }
                                                                                    result={
                                                                                        tool.result
                                                                                    }
                                                                                />
                                                                            )
                                                                        }

                                                                        return null
                                                                    }
                                                                )}
                                                            </>
                                                        }
                                                    />
                                                )
                                            })
                                        )}
                                        {isLoading && <ChatLoadingSkeleton />}
                                    </div>
                                </ScrollArea>
                            </CardContent>

                            <CardFooter className="p-4 bg-background">
                                <form
                                    className="flex w-full gap-2"
                                    onSubmit={(e) =>
                                        handleSubmit(e, {
                                            body: {
                                                message: input,
                                                instructions,
                                            },
                                        })
                                    }
                                >
                                    <Input
                                        className="flex-grow"
                                        placeholder={t('typeMessage')}
                                        value={input}
                                        onChange={handleInputChange}
                                        disabled={isLoading}
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                        <span className="sr-only">
                                            {t('sendMessage')}
                                        </span>
                                    </Button>
                                </form>
                            </CardFooter>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
