'use client'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { ShowCaseChatAI } from '@/actions/dashboard/AI/ShowCaseActions'
import { ChatInput, ChatTextArea } from '@/components/dashboards/Common/chat/chat'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

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
    const {
        messagesRef,
        scrollRef,
        visibilityRef,
        isAtBottom,
        scrollToBottom,
    } = useScrollAnchor()

    console.log(conversation, '<  conversation')

    return (
        <div ref={scrollRef} className="h-full relative overflow-auto pt-4">
            <div ref={messagesRef} className="pb-[380px] lg:pb-[360px]">
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
                <div ref={visibilityRef} className="w-full h-px" />
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

// const EmptyState: React.FC<{
//     setIsLoading: (value: boolean) => void
//     continueFreeChatConversation: (input: string) => Promise<ClientMessage>
//     setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
//     chatId?: number
// }> = ({
//     setIsLoading,
//     continueFreeChatConversation,
//     setConversation,
//     chatId,
// }) => (
//     <div className="flex flex-col gap-4">
//         <p className="text-lg">Ask me anything, I'm here to help!</p>
//         <div className="w-full flex flex-col gap-4">
//             <SuggestionsContainer
//                 suggestions={[
//                     {
//                         title: 'What is the capital of France?',
//                         description: 'Ask me about anything',
//                     },
//                     {
//                         title: 'What is the weather in London?',
//                         description: 'Ask me about anything',
//                     },
//                     {
//                         title: 'What is the population of New York?',
//                         description: 'Ask me about anything',
//                     },
//                 ]}
//                 onSuggestionClick={async (suggestion) => {
//                     if (chatId) {
//                         await studentUpdateChatTitle({
//                             chatId,
//                             title: suggestion,
//                         })
//                     } else {
//                         await studentCreateNewChatAndRedirect({
//                             title: suggestion,
//                             chatType: 'free_chat',
//                             insertMessage: true,
//                         })
//                     }
//                     setConversation((currentConversation) => [
//                         ...currentConversation,
//                         {
//                             id: generateId(),
// role: 'user',
//                             role: 'user',
//                             display: (
//                                 <Message
//                                     sender={'user'}
//                                     time={new Date().toDateString()}
//                                     isUser={true}
//                                 >
//                                     <ViewMarkdown markdown={suggestion} />
//                                 </Message>
//                             ),
//                         },
//                     ])
//                     await runUserMessage({
//                         input: suggestion,
//                         setConversation,
//                         continueFreeChatConversation,
//                         chatId,
//                     })
//                     setIsLoading(false)
//                 }}
//             />
//         </div>
//     </div>
// )

const ChatList: React.FC<{ messages: UIState }> = ({ messages }) => (
    <div className="relative px-4">
        {messages.map((message, index) => (
            <div key={index} className="flex flex-col gap-2">
                {message.display}
            </div>
        ))}
    </div>
)
