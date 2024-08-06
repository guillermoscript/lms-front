'use client'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useEffect, useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { FreeChatAI, UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { studentCreateNewChatAndRedirect, studentInsertChatMessage, studentUpdateChatTitle } from '@/actions/dashboard/chatActions'
import { ChatInput, Message } from '@/components/dashboards/Common/chat/chat'
import SuggestionsContainer from '@/components/dashboards/Common/chat/SuggestionsContainer'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

import ChatLoadingSkeleton from './ChatLoadingSkeleton'

function  MainContainer ({ children }: {
    children: React.ReactNode
}) {
    return (
        <main className="relative h-full w-full flex-1 overflow-auto transition-width">
            <div
                role="presentation"
                className="flex h-full flex-col focus-visible:outline-0"
                tabIndex={0}
            >
                <div className="flex-1 overflow-hidden">{children}</div>
            </div>
        </main>
    )
}

interface ConversationTurnProps {
    role?: 'user' | 'assistant'
    message: string | React.ReactNode
    placeholder?: string
}

const ConversationTurn: React.FC<ConversationTurnProps> = ({
    role,
    message,
}) => (
    <div className={`w-full text-token-text-primary`} dir="auto">
        <div className="text-base py-[18px] px-3 md:px-4 m-auto md:px-5 lg:px-1 xl:px-5">
            <div className="mx-auto flex flex-1 gap-4 text-base md:gap-5 lg:gap-6 md:max-w-3xl lg:max-w-[40rem] xl:max-w-[48rem]">
                <div
                    className={`group/conversation-turn relative flex w-full min-w-0 flex-col ${
                        role === 'assistant' ? 'items-end' : ''
                    }`}
                >
                    <div className="flex-col gap-1 md:gap-3">
                        <div className="flex flex-grow flex-col max-w-full">
                            <div
                                data-message-author-role={role}
                                dir="auto"
                                className="min-h-[20px] text-message flex w-full flex-col items-end gap-2 whitespace-pre-wrap break-words overflow-x-auto"
                            >
                                <div
                                    className={`flex w-full flex-col gap-1 empty:hidden ${
                                        role === 'assistant' && 'first:pt-[3px]'
                                    }`}
                                >
                                    {message}
                                </div>
                            </div>
                        </div>
                        {/* Add additional elements such as reactions or feedback based on the role */}
                    </div>
                </div>
            </div>
        </div>
    </div>
)

function MessageInputArea ({
    callback
}: {
    callback?: (input: string) => void
})  {
    return (
        <div className="md:pt-0 dark:border-white/20 md:border-transparent md:dark:border-transparent w-full">
            <div className="text-base px-3 md:px-4 m-auto md:px-5 lg:px-1 xl:px-5">
                <div className="mx-auto flex flex-1 gap-4 text-base md:gap-5 lg:gap-6 md:max-w-3xl lg:max-w-[40rem] xl:max-w-[48rem]">
                    <form 
                        onSubmit={(e) => {
                            e.preventDefault()
                            callback?.(e.currentTarget['prompt-textarea'].value)
                        }}
                        className="w-full">
                        <div className="relative flex h-full max-w-full flex-1 flex-col">
                            <div className="flex w-full items-center">
                                <div className="flex w-full flex-col gap-1.5 rounded-[26px] p-1.5 transition-colors bg-[#f4f4f4] dark:bg-token-main-surface-secondary">
                                    <div className="flex items-end gap-1.5 md:gap-2">
                                        <input
                                            type="file"
                                            style={{ display: 'none' }}
                                            tabIndex={-1}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            className="text-token-text-primary border border-transparent inline-flex items-center justify-center gap-1 rounded-lg text-sm dark:transparent dark:bg-transparent leading-none outline-none cursor-pointer hover:bg-token-main-surface-secondary dark:hover:bg-token-main-surface-secondary focus-visible:bg-token-main-surface-secondary m-0 h-0 w-0 border-none bg-transparent p-0"
                                        ></button>
                                        <button
                                            className="flex items-center justify-center h-8 w-8 rounded-full text-token-text-primary focus-visible:outline-black dark:text-white dark:focus-visible:outline-white mb-1 ml-1.5"
                                            aria-disabled="false"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width={24}
                                                height={24}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    fill="currentColor"
                                                    fillRule="evenodd"
                                                    d="M9 7a5 5 0 0 1 10 0v8a7 7 0 1 1-14 0V9a1 1 0 0 1 2 0v6a5 5 0 0 0 10 0V7a3 3 0 1 0-6 0v8a1 1 0 1 0 2 0V9a1 1 0 1 1 2 0v6a3 3 0 1 1-6 0z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </button>
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            <textarea
                                                id="prompt-textarea"
                                                tabIndex={0}
                                                dir="auto"
                                                rows={1}
                                                placeholder="Message ChatGPT"
                                                className="m-0 resize-none border-0 bg-transparent px-0 text-token-text-primary focus:ring-0 focus-visible:ring-0 max-h-[25dvh] max-h-52"
                                                style={{
                                                    height: 40,
                                                    overflowY: 'hidden',
                                                }}
                                            />
                                        </div>
                                        <button
                                            data-testid="send-button"
                                            className="mb-1 me-1 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white transition-colors hover:opacity-70 focus-visible:outline-none focus-visible:outline-black disabled:bg-[#D7D7D7] disabled:text-[#f4f4f4] disabled:hover:opacity-100 dark:bg-white dark:text-black dark:focus-visible:outline-white disabled:dark:bg-token-text-quaternary dark:disabled:text-token-main-surface-secondary"
                                            disabled
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width={32}
                                                height={32}
                                                fill="none"
                                                viewBox="0 0 32 32"
                                            >
                                                <path
                                                    fill="currentColor"
                                                    fillRule="evenodd"
                                                    d="M15.192 8.906a1.143 1.143 0 0 1 1.616 0l5.143 5.143a1.143 1.143 0 0 1-1.616 1.616l-3.192-3.192v9.813a1.143 1.143 0 0 1-2.286 0v-9.813l-3.192 3.192a1.143 1.143 0 1 1-1.616-1.616z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            <div className="relative px-2 py-2 text-center text-xs text-token-text-secondary md:px-[60px]">
                <span>ChatGPT can make mistakes. Check important info.</span>
            </div>
        </div>
    )
}

const HelperButton: React.FC = () => (
    <div className="group absolute bottom-2 end-2 z-10 hidden gap-1 md:flex lg:bottom-3 lg:end-3">
        <button
            className="flex h-6 w-6 items-center justify-center rounded-full border border-token-border-light text-xs text-token-text-secondary"
            type="button"
        >
            ?
        </button>
    </div>
)
async function runUserMessage ({
    input,
    setConversation,
    continueFreeChatConversation,
    chatId,
    addNewChatMessage
}: {
    input: string
    setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
    continueFreeChatConversation: (input: string) => Promise<ClientMessage>
    addNewChatMessage?: boolean
    chatId?: number
}) {
    if (addNewChatMessage) {
        await studentInsertChatMessage({ chatId, message: input })
    }

    const message = await continueFreeChatConversation(input)
    setConversation((currentConversation: ClientMessage[]) => [
        ...currentConversation,
        message
    ])
}


export function MainPage ({
    chatId
}: {
    children?: React.ReactNode
    chatId?: number
}) {
    const [conversation, setConversation] = useUIState<typeof FreeChatAI>()
    const { continueFreeChatConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [stop, setStop] = useState(false)
    const [aiState, setAiState] = useAIState()

    const {
        scrollRef,
        visibilityRef,
        isAtBottom,
        scrollToBottom
    } = useScrollAnchor()

    useEffect(() => {
        scrollToBottom()
    }, [conversation, scrollToBottom])

    useEffect(() => {
        if (chatId) {
            if (aiState.messages.length === 1) {
                setIsLoading(true)
                runUserMessage({
                    input: aiState.messages[0].content,
                    setConversation,
                    continueFreeChatConversation,
                }).finally(() => setIsLoading(false))
            }
        }
    }, [])

    return (
        <MainContainer>
            {conversation.length > 0 ? (
                    <ChatList messages={conversation} />
                ) : (
                    <h3>
                        Start a conversation with ChatGPT
                    </h3>
                )}
                {isLoading && <ChatLoadingSkeleton />}
            <MessageInputArea />
            <HelperButton />
        </MainContainer>
    )
}



interface ChatListProps {
    messages: UIState
}

export function ChatList ({ messages }: ChatListProps) {
    return (
        <>
            {messages.map((message, index) => (
                <ConversationTurn
                    key={index}
                    message={message.display}
                />
            ))}
            <div className="h-px" />
        </>
    )
}
