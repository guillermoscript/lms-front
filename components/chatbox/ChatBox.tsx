'use client'

import { generateId } from 'ai'
import { useChat } from 'ai/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ChevronDown,
    ChevronUp,
    Loader2,
    MessageSquare,
    Send,
    X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

import ViewMarkdown from '../ui/markdown/ViewMarkdown'

interface ChatBoxProps {
    instructions: string
}

const quickAccessButtons = [
    { label: 'productQuestions', icon: '📦' },
    { label: 'shareFeedback', icon: '📝' },
    { label: 'loggingIn', icon: '🔐' },
    { label: 'reset2FA', icon: '🔑' },
    { label: 'abuseReport', icon: '🚫' },
    { label: 'contactingSales', icon: '💼' },
]

export default function ChatBox({ instructions }: ChatBoxProps) {
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const chatBoxRef = useRef<HTMLDivElement>(null)
    const t = useScopedI18n('ChatBox')

    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        append,
    } = useChat({
        api: '/api/chatbox-ai',
        initialMessages: [
            {
                id: generateId(),
                content: instructions,
                role: 'system',
            },
        ],
    })

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
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    const handleQuickAccess = (question: string) => {
        append({
            content: t(`quickAccess.${question}`),
            role: 'user',
        })
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
                                                                        button.label
                                                                    )
                                                                }
                                                            >
                                                                <span className="mr-2">
                                                                    {
                                                                        button.icon
                                                                    }
                                                                </span>
                                                                {t(
                                                                    `quickAccess.${button.label}`
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
                                                    <div
                                                        key={message.id}
                                                        className="flex items-start space-x-2"
                                                    >
                                                        <Avatar className="mt-0.5">
                                                            <AvatarImage
                                                                src={
                                                                    message.role ===
                                                                    'user'
                                                                        ? '/user-avatar.png'
                                                                        : '/img/robot.jpeg'
                                                                }
                                                            />
                                                            <AvatarFallback>
                                                                {message.role ===
                                                                'user'
                                                                    ? 'U'
                                                                    : 'A'}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div
                                                            className={
                                                                'flex-1 overflow-hidden rounded-md p-3'
                                                            }
                                                        >
                                                            <ViewMarkdown
                                                                markdown={
                                                                    message.content
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        )}
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
