'use client'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { TaskAiActions } from '@/actions/dashboard/AI/TaskAiActions'
import { studentEditAiTaskMessage } from '@/actions/dashboard/lessonsAction'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { ChatInput, ChatTextArea } from '@/components/dashboards/Common/chat/chat'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Message from '@/components/dashboards/Common/chat/Message'
import MessageContentWrapper from '@/components/dashboards/Common/chat/MessageContentWrapper'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import RegenerateMessage from './RegenerateMessage'

export default function EditTaksMessage({
    text,
    sender,
    viewMode,
    setViewMode,
}: {
    text: string
    sender: 'user' | 'assistant'
    viewMode?: 'view' | 'edit'
    setViewMode?: React.Dispatch<React.SetStateAction<'view' | 'edit'>>
}) {
    const [aiState, setAiState] = useAIState()
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [stop, setStop] = useState<boolean>(false)
    const [buttonSelected, setButtonSelected] = useState<string>('')
    const [conversation, setConversation] = useUIState<typeof TaskAiActions>()
    const { continueTaskAiConversation } = useActions()

    console.log(conversation.map((message) => message.id))

    async function editMessageFun(newText: string, buttonSelected: string) {
        const message = aiState.messages.find((message) => message.content === text)
        const messageIndex = aiState.messages.findIndex((message) => message.content === text)

        console.log(message)

        const res = await studentEditAiTaskMessage({
            sender,
            lessonId: aiState.lessonId,
            messageId: /^[0-9]+$/g.test(message.id) ? Number(message.id) : undefined,
            message: text,
            newMessage: newText,
            regenerate: buttonSelected === 'editAndRegenerate',
        })

        if (res.status === 'success') {
            if (buttonSelected === 'editAndRegenerate') {
                setAiState({
                    ...aiState,
                    messages: [
                        ...aiState.messages.slice(0, messageIndex),
                        { ...message, content: newText },
                    ],
                })

                // now remove all the messages after the current message, to do this we use the messageIndex and all the subsequent messages are removed
                // also we need to replace the current message text with the new text

                setConversation((currentConversation: ClientMessage[]) => [
                    ...currentConversation.slice(0, messageIndex - 1),
                    {
                        id: message.id,
                        role: 'assistant',
                        display: <Message
                            sender={'user'}
                            time={new Date().toDateString()}
                            isUser={true}
                        >
                            <MessageContentWrapper
                                view={
                                    <ViewMarkdown markdown={newText} />
                                }
                                role='assistant'
                                edit={
                                    <EditTaksMessage
                                        text={newText}
                                        sender='assistant'
                                        viewMode={viewMode}
                                        setViewMode={setViewMode}
                                    />
                                }
                                regenerate={
                                    <RegenerateMessage
                                        message='Regenerate'
                                        viewMode={viewMode}
                                        setViewMode={setViewMode}
                                    />
                                }
                            />
                        </Message>,
                    },
                ])


                const messageRes = await continueTaskAiConversation(newText, res.data.toString())
                setConversation((currentConversation: ClientMessage[]) => [
                    ...currentConversation,
                    messageRes,
                ])
            }
            setViewMode('view')
        }
    }

    const handleCallback = async (input: { content: string }) => {
        if (stop) return
        setIsLoading(true)
        try {
            await editMessageFun(input.content, buttonSelected)
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const renderButtons = (
        <div className="flex items-center justify-center gap-4">
            <Button
                onClick={() => setButtonSelected('editAndRegenerate')}
                disabled={isLoading}
            >
                Edit and Regenerate AI Response
            </Button>
            <Button
                onClick={() => setButtonSelected('edit')}
                disabled={isLoading}
                variant="secondary"
            >
                Edit
            </Button>
        </div>
    )

    if (isLoading) {
        return <ChatLoadingSkeleton />
    }

    return (
        <Tabs defaultValue="simple" className="w-full py-4">
            <TabsList>
                <TabsTrigger value="simple">Simple</TabsTrigger>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
            </TabsList>
            <TabsContent value="markdown">
                <ChatInput
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    text={text}
                    callbackFunction={handleCallback}
                    buttonChildren={renderButtons}
                />
            </TabsContent>
            <TabsContent value="simple">
                <ChatTextArea
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    text={text}
                    callbackFunction={handleCallback}
                    buttonChildren={renderButtons}
                />
            </TabsContent>
        </Tabs>
    )
}
