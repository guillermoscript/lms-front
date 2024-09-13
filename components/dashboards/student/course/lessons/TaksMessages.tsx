'use client'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useRef, useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { TaskAiActions } from '@/actions/dashboard/AI/TaskAiActions'
import { studentSubmitAiTaskMessage } from '@/actions/dashboard/lessonsAction'
import { useScopedI18n } from '@/app/locales/client'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { ChatInput, ChatTextArea, SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import Message from '@/components/dashboards/Common/chat/Message'
import MessageContentWrapper from '@/components/dashboards/Common/chat/MessageContentWrapper'
import MarkdownEditorTour from '@/components/dashboards/Common/tour/MarkdownEditorTour'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useNoCopy from '@/utils/hooks/useNoCopy'

import EditTaksMessage from './EditTaksMessage'

async function handleSubmitMessage({
    input,
    setConversation,
    setIsLoading,
    stop,
    continueTaskAiConversation,
    lessonId,
}: {
    input: string
    setConversation: (value: any) => void
    setIsLoading: (value: boolean) => void
    stop: boolean
    continueTaskAiConversation: (content: string, id: string) => Promise<ClientMessage>
    lessonId: number
}) {
    if (stop) return

    setIsLoading(true)

    const res = await studentSubmitAiTaskMessage({
        lessonId,
        message: {
            content: input,
            role: 'user',
        },
    })

    setConversation((currentConversation: ClientMessage[]) => [
        ...currentConversation,
        {
            id: res.data,
            role: 'user',
            display: (
                <Message
                    sender={'user'}
                    time={new Date().toDateString()}
                    isUser={true}
                >
                    <MessageContentWrapper
                        view={
                            <ViewMarkdown markdown={input} />
                        }
                        role='user'
                        edit={
                            <EditTaksMessage
                                text={input}
                                sender='user'
                            />
                        }
                    />
                </Message>
            ),
        },
    ])

    const message = await continueTaskAiConversation(input, res.data.toString())
    setConversation((currentConversation: ClientMessage[]) => [
        ...currentConversation,
        message,
    ])
    console.log(message)
    setIsLoading(false)
}

export default function TaksMessages({
    lessonId,
    isLessonAiTaskCompleted,
}: {
    lessonId?: number
    isLessonAiTaskCompleted: boolean
}) {
    const [conversation, setConversation] = useUIState<typeof TaskAiActions>()
    const { continueTaskAiConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [stop, setStop] = useState(false)
    const [aiState] = useAIState()
    const t = useScopedI18n('LessonContent.TaksMessages')

    const isLastMessageFromMakeUserAssigmentCompleted =
        aiState?.messages[aiState?.messages.length - 1]?.role === 'tool' &&
        aiState?.messages[aiState?.messages.length - 1]?.content[0]?.toolName ===
            'makeUserAssigmentCompleted'

    return (
        <div className="w-full px-1">
            <div
                id='task-messages'
                className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4"
            >
                {conversation.length > 0 ? (
                    <ChatList messages={conversation} />
                ) : (
                    <div className="flex flex-col gap-4">
                        <p className="text-lg">
                            {t('title')}
                        </p>
                    </div>
                )}

                {isLoading && <ChatLoadingSkeleton />}
                <div className="w-full h-px" />
                {!isLastMessageFromMakeUserAssigmentCompleted &&
                    !isLessonAiTaskCompleted && (
                    <>
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
                                        {t('simple')}
                                    </TabsTrigger>
                                    <TabsTrigger
                                        id='markdown-tab'
                                        value="markdown"
                                    >
                                        {t('markdown')}
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
                                    stop={() => setStop(true)}
                                    callbackFunction={async (input) => {
                                        handleSubmitMessage({
                                            input: input.content,
                                            setIsLoading,
                                            setConversation,
                                            continueTaskAiConversation,
                                            stop,
                                            lessonId,
                                        })
                                    }}
                                />
                            </TabsContent>
                            <TabsContent
                                id='simple-content'
                                value="simple"
                            >
                                <ChatTextArea
                                    isLoading={isLoading}
                                    stop={() => setStop(true)}
                                    callbackFunction={async (input) => {
                                        handleSubmitMessage({
                                            input: input.content,
                                            setIsLoading,
                                            setConversation,
                                            continueTaskAiConversation,
                                            stop,
                                            lessonId,
                                        })
                                    }}
                                />
                            </TabsContent>
                        </Tabs>
                    </>
                )}

                {isLessonAiTaskCompleted && (
                    <SuccessMessage
                        status={t('status')}
                        message={t('Assignment marked as completed.')}
                    />
                )}
            </div>
        </div>
    )
}

interface ChatListProps {
    messages: UIState
    messagesEndRef?: React.RefObject<HTMLDivElement>
}

function ChatList({ messages, messagesEndRef }: ChatListProps) {
    const contentRef = useRef(null)

    useNoCopy(contentRef)

    return (
        <div
            ref={contentRef} className="relative"
        >
            {messages.map((message, index) => (
                <div key={index} className="flex flex-col gap-2">
                    {message.display}
                </div>
            ))}
            <div ref={messagesEndRef} className="h-px" />
        </div>
    )
}
