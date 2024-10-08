'use client'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { ShowCaseChatAI } from '@/actions/dashboard/AI/ShowCaseActions'
import { ChatInput, ChatTextArea } from '@/components/dashboards/Common/chat/chat'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import Message from '../Common/chat/Message'
import MessageContentWrapper from '../Common/chat/MessageContentWrapper'
import MarkdownEditorTour from '../Common/tour/MarkdownEditorTour'
import ChatLoadingSkeleton from './ChatLoadingSkeleton'

interface FreeChatProps {
    children?: React.ReactNode
    systemPrompt: string
}

export default function ShowCaseChat({ systemPrompt }: FreeChatProps) {
    const [conversation, setConversation] = useUIState<typeof ShowCaseChatAI>()
    const { continueShowCaseChatConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)

    console.log(conversation, '<  conversation')

    return (
        <div className="h-full relative overflow-auto pt-4">
            <div className="pb-[380px] lg:pb-[360px]">
                {conversation.length > 0 ? (
                    <ChatList messages={conversation} />
                ) : (
                    // <EmptyState
                    //     setIsLoading={setIsLoading}
                    //     continueFreeChatConversation={continueFreeChatConversation}
                    //     setConversation={setConversation}
                    //     chatId={chatId}
                    // />
                    <>
                    </>
                )}
                {isLoading && <ChatLoadingSkeleton />}
                <div className="w-full h-px" />
            </div>
            <div className='w-full absolute bottom-0'>
                <Tabs defaultValue="simple" className="w-full py-4">
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
                        <ChatInput
                            isLoading={isLoading}
                            callbackFunction={async (input) => {
                                setIsLoading(true)

                                console.log(input, '<  input.content')

                                setConversation([
                                    ...conversation,
                                    {
                                        id: generateId(),
                                        role: 'user',
                                        display: (
                                            <Message
                                                sender={'user'}
                                                time={new Date().toDateString()}
                                                isUser={true}
                                            >
                                                <MessageContentWrapper
                                                    role="user"
                                                    view={<ViewMarkdown markdown={input.content} />}
                                                    edit={<></>
                                                    }
                                                />
                                            </Message>
                                        ),
                                    },
                                ])

                                const result = await continueShowCaseChatConversation(input.content, systemPrompt)

                                setConversation((currentConversation) => [
                                    ...currentConversation,
                                    result
                                ])

                                setIsLoading(false)
                            }}
                        />
                    </TabsContent>
                    <TabsContent
                        id='simple-content'
                        value="simple"
                    >
                        <ChatTextArea
                            isLoading={isLoading}
                            callbackFunction={async (input) => {
                                setIsLoading(true)
                                setConversation([
                                    ...conversation,
                                    {
                                        id: generateId(),
                                        role: 'user',
                                        display: (
                                            <Message
                                                sender={'user'}
                                                time={new Date().toDateString()}
                                                isUser={true}
                                            >

                                                <MessageContentWrapper
                                                    role="user"
                                                    view={<ViewMarkdown markdown={input.content} />}
                                                    edit={<></>
                                                    }
                                                />
                                            </Message>
                                        ),
                                    },
                                ])

                                const result = await continueShowCaseChatConversation(input.content, systemPrompt)

                                setConversation((currentConversation) => [
                                    ...currentConversation,
                                    result
                                ])

                                setIsLoading(false)
                            }}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

const ChatList: React.FC<{ messages: UIState }> = ({ messages }) => (
    <div className="relative px-4">
        {messages.map((message, index) => (
            <div key={index} className="flex flex-col gap-2">
                {message.display}
            </div>
        ))}
    </div>
)
