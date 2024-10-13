'use client'
import { useChat } from 'ai/react'
import { Maximize2, MessageSquare, Minimize2, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

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

interface ChatBoxProps {
    instructions: string
}

export default function ChatBox({ instructions }: ChatBoxProps) {
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const chatBoxRef = useRef<HTMLDivElement>(null)

    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        setMessages,
        isLoading,
    } = useChat({
        api: '/api/chatbox-ai', // La API personalizada
        streamProtocol: 'text', // Protocolo de comunicación
        keepLastMessageOnError: true,
    })

    const toggleChat = () => {
        if (isChatOpen) {
            setIsChatOpen(false)
            setIsExpanded(false)
        } else {
            setIsChatOpen(true)
        }
    }

    const clearChat = () => {
        setMessages([])
    }

    const toggleExpand = () => {
        setIsExpanded((prev) => !prev)
    }

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

    return (
        <>
            {/* Botón para abrir/cerrar el chat */}
            <Button
                size="icon"
                variant="outline"
                className="fixed bottom-5 right-20 w-10 h-10 rounded-md shadow-lg bg-purple-800 hover:bg-purple-900 text-white z-50"
                onClick={toggleChat}
            >
                <MessageSquare className="h-5 w-5" />
                <span className="sr-only">
                    {isChatOpen ? 'Close chat' : 'Open chat'}
                </span>
            </Button>

            {/* Contenedor del chat */}
            {isChatOpen && (
                <div
                    ref={chatBoxRef}
                    className={`
            fixed transition-all duration-300 ease-in-out z-40
            ${
                isExpanded
                    ? 'inset-4 md:inset-10'
                    : 'bottom-20 right-4 md:right-20 w-[calc(100%-2rem)] md:w-80 h-[400px]'
                }
          `}
                >
                    <Card className="w-full h-full shadow-xl bg-black text-white overflow-hidden flex flex-col">
                        {/* Cabecera del chat */}
                        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-800 p-4 flex-shrink-0">
                            <CardTitle className="text-purple-500">
                                Chat
                            </CardTitle>
                            <div className="flex gap-2">
                                {/* Botón para limpiar el chat */}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={clearChat}
                                    className="text-purple-500 hover:text-purple-400 hover:bg-gray-800"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Clear chat</span>
                                </Button>
                                {/* Botón para minimizar/maximizar el chat */}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={toggleExpand}
                                    className="text-purple-500 hover:text-purple-400 hover:bg-gray-800"
                                >
                                    {isExpanded ? (
                                        <Minimize2 className="h-4 w-4" />
                                    ) : (
                                        <Maximize2 className="h-4 w-4" />
                                    )}
                                    <span className="sr-only">
                                        {isExpanded
                                            ? 'Minimize chat'
                                            : 'Expand chat'}
                                    </span>
                                </Button>
                                {/* Botón para cerrar el chat */}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={toggleChat}
                                    className="text-purple-500 hover:text-purple-400 hover:bg-gray-800"
                                >
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">Close chat</span>
                                </Button>
                            </div>
                        </CardHeader>

                        {/* Contenido del chat */}
                        <CardContent className="p-0 flex-grow overflow-hidden">
                            <ScrollArea
                                className="h-full p-4"
                                ref={scrollAreaRef}
                            >
                                {messages.length === 0 ? (
                                    <p className="text-sm text-gray-400">
                                        No messages yet.
                                    </p>
                                ) : (
                                    messages.map((message) => (
                                        <div key={message.id} className="mb-4">
                                            {/* Remitente del mensaje */}
                                            <div
                                                className={`text-xs font-semibold mb-1 ${
                                                    message.role === 'user'
                                                        ? 'text-right'
                                                        : 'text-left'
                                                }`}
                                            >
                                                {message.role === 'user'
                                                    ? 'User'
                                                    : 'Bot'}
                                            </div>
                                            {/* Burbuja del mensaje */}
                                            <div
                                                className={`p-2 rounded-lg ${
                                                    message.role === 'user'
                                                        ? 'bg-purple-800 text-white ml-auto'
                                                        : 'bg-gray-800 text-white'
                                                } max-w-[80%] ${
                                                    message.role === 'user'
                                                        ? 'text-right'
                                                        : 'text-left'
                                                }`}
                                            >
                                                {message.content}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </ScrollArea>
                        </CardContent>

                        {/* Pie de página del chat con el input y el botón de enviar */}
                        <CardFooter className="border-t border-gray-800 p-4 flex-shrink-0">
                            <form
                                className="flex w-full gap-2"
                                onSubmit={(e) =>
                                    handleSubmit(e, {
                                        body: {
                                            message: input, // Mensaje del usuario
                                            instructions, // Instrucciones pasadas como props
                                        },
                                    })
                                }
                            >
                                <Input
                                    className="flex-grow bg-gray-900 border-gray-700 text-white placeholder-gray-400"
                                    placeholder="Type your message..."
                                    type="text"
                                    value={input}
                                    onChange={handleInputChange}
                                    disabled={isLoading}
                                />
                                <Button
                                    type="submit"
                                    className="bg-purple-800 hover:bg-purple-900 text-white"
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Loading...' : 'Send'}
                                </Button>
                            </form>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </>
    )
}
