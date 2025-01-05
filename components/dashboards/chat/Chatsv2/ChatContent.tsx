'use client'
import { generateId, Message } from 'ai'
import { useChat } from 'ai/react'
import { useState } from 'react'

import { studentCreateNewChat, studentInsertChatMessage } from '@/actions/dashboard/chatActions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tables } from '@/utils/supabase/supabase'

import { ChatTextArea } from '../../Common/chat/chat'
import MarkdownEditorTour from '../../Common/tour/MarkdownEditorTour'
import ChatMessages from './ChatMessages'
import MarkdowEditorInput from './MarkdowEditorInput'

export default function ChatContent({
    chatIdProp,
    chatMessages,
    chatType
}: {
    chatIdProp?: number
    chatType: Tables<'chats'>['chat_type']
    chatMessages?: Message[]
}) {
    const [chatId, setChatId] = useState(chatIdProp)
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        reload,
        setInput,
        setMessages,
        stop,
        append,
    } = useChat({
        initialMessages: chatMessages,
        maxSteps: 2,
        body: {
            chatId
        },
        onFinish(message, options) {
            console.log('onFinish', message, options)
        },
    })

    const handleSendMessage = (content: string) => {
        append({
            content,
            role: 'user',
            createdAt: new Date(),
            id: generateId(),
        })
        if (!chatId) {
            studentCreateNewChat({
                chatType,
                title: content,
            }).then(res => {
                setChatId(res.data.chat_id)
            })
        } else {
            studentInsertChatMessage({
                chatId,
                message: content,
            })
        }
    }

    return (
        <>
            <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center pt-8 justify-between">
                <div className="flex flex-1 flex-col items-center justify-center space-y-6 w-full overflow-hidden">
                    {messages.length === 1 && messages[0].role === 'system' && (
                        <div className="prompt-section">
                            <p>Please enter your message to get started.</p>
                        </div>
                    )}
                    <ChatMessages
                        reload={async (messageToEdit) => {
                            setInput(messageToEdit.content)
                            const messageIndex = messages.findIndex(m => m.id === messageToEdit.id)
                            const newMessages = messages.slice(0, messageIndex)
                            setMessages(newMessages)

                            reload()
                            setInput('')
                        }}
                        messages={messages}
                        isLoading={isLoading}
                        disabled={isLoading}
                    />
                </div>
                {/* <div className="w-full p-4">

                </div> */}
                <Tabs defaultValue="markdown" className="w-full py-4">
                    <div className="flex gap-4">
                        <TabsList
                            id='tabs-list'
                            className='gap-4'
                        >
                            <TabsTrigger
                                id='simple-tab'
                                value="simple"
                            >
                                Simple
                            </TabsTrigger>
                            <TabsTrigger
                                id='markdown-tab'
                                value="markdown"
                            >
                                Markdown
                            </TabsTrigger>
                        </TabsList>
                        <MarkdownEditorTour />
                    </div>
                    <TabsContent
                        id='markdown-content'
                        value="markdown"
                    >
                        <MarkdowEditorInput
                            isLoading={isLoading}
                            stop={() => stop()}
                            callbackFunction={(message) => {
                                handleSendMessage(message.content)
                            }}
                            isTemplatePresent={true}
                        />
                    </TabsContent>
                    <TabsContent
                        id='simple-content'
                        value="simple"
                    >
                        <ChatTextArea
                            isLoading={isLoading}
                            stop={() => stop()}
                            callbackFunction={async (message) => {
                                handleSendMessage(message.content)
                            }}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </>
    )
}
