'use client'
import { useEffect, useState } from 'react'
import { generateId } from 'ai'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { FreeChatAI, UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import {
  studentCreateNewChatAndRedirect,
  studentInsertChatMessage,
  studentUpdateChatTitle,
} from '@/actions/dashboard/chatActions'
import { ChatInput, Message } from '@/components/dashboards/Common/chat/chat'
import SuggestionsContainer from '@/components/dashboards/Common/chat/SuggestionsContainer'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import ChatLoadingSkeleton from './ChatLoadingSkeleton'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

interface RunUserMessageParams {
  input: string
  setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
  continueFreeChatConversation: (input: string) => Promise<ClientMessage>
  addNewChatMessage?: boolean
  chatId?: number
}

const runUserMessage = async ({
  input,
  setConversation,
  continueFreeChatConversation,
  chatId,
  addNewChatMessage,
}: RunUserMessageParams) => {
  if (addNewChatMessage)
    await studentInsertChatMessage({ chatId, message: input })
  try {
    const message = await continueFreeChatConversation(input)
    setConversation((currentConversation: ClientMessage[]) => [
      ...currentConversation,
      message,
    ])
  } catch (error) {
    console.log(error)
  }
}

interface FreeChatProps {
  children?: React.ReactNode
  chatId?: number
}

export default function FreeChat({ chatId }: FreeChatProps) {
  const [conversation, setConversation] = useUIState<typeof FreeChatAI>()
  const { continueFreeChatConversation } = useActions()
  const [isLoading, setIsLoading] = useState(false)
  const [aiState] = useAIState()
  const {
    messagesRef,
    scrollRef,
    visibilityRef,
    isAtBottom,
    scrollToBottom,
  } = useScrollAnchor()

  useEffect(() => {
    if (chatId && aiState.messages.length === 1) {
      setIsLoading(true)
      runUserMessage({
        input: aiState.messages[0].content,
        setConversation,
        continueFreeChatConversation,
        chatId,
      }).finally(() => setIsLoading(false))
    }
  }, [chatId, aiState.messages, continueFreeChatConversation, setConversation])

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom()
    }
  }, [conversation, isAtBottom, scrollToBottom])

  return (
    <div ref={scrollRef} className="h-full relative overflow-auto pt-4">
      <div ref={messagesRef} className="pb-[350px] lg:pb-[300px]">
        {conversation.length > 0 ? (
          <ChatList messages={conversation} />
        ) : (
          <EmptyState
            setIsLoading={setIsLoading}
            continueFreeChatConversation={continueFreeChatConversation}
            setConversation={setConversation}
            chatId={chatId}
          />
        )}
        {isLoading && <ChatLoadingSkeleton />}
        <div ref={visibilityRef} className="w-full h-px" />
      </div>
      <div className='w-full absolute bottom-0'>
        <ChatInput
          isLoading={isLoading}
          callbackFunction={async (input) => {
            setIsLoading(true)
            if (!chatId)
              await studentCreateNewChatAndRedirect({
                title: input.content,
                chatType: 'free_chat',
                insertMessage: true,
              })
            if (aiState.messages.length === 0 && chatId)
              await studentUpdateChatTitle({
                chatId,
                title: input.content,
              })
            setConversation((currentConversation: ClientMessage[]) => [
              ...currentConversation,
              {
                id: generateId(),
                role: 'user',
                display: (
                  <Message
                    sender={'user'}
                    time={new Date().toDateString()}
                    isUser={true}
                  >
                    <ViewMarkdown markdown={input.content} />
                  </Message>
                ),
              },
            ])
            try {
              await runUserMessage({
                input: input.content,
                setConversation,
                continueFreeChatConversation,
                chatId,
                addNewChatMessage: true,
              })
            } catch (error) {
              console.error(error)
            } finally {
              setIsLoading(false)
              if (isAtBottom) {
                scrollToBottom()
              }
            }
          }}
        />
      </div>
    </div>
  )
}

const EmptyState: React.FC<{
  setIsLoading: (value: boolean) => void
  continueFreeChatConversation: (input: string) => Promise<ClientMessage>
  setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
  chatId?: number
}> = ({
  setIsLoading,
  continueFreeChatConversation,
  setConversation,
  chatId,
}) => (
  <div className="flex flex-col gap-4">
    <p className="text-lg">Ask me anything, I'm here to help!</p>
    <div className="w-full flex flex-col gap-4">
      <SuggestionsContainer
        suggestions={[
          {
            title: 'What is the capital of France?',
            description: 'Ask me about anything',
          },
          {
            title: 'What is the weather in London?',
            description: 'Ask me about anything',
          },
          {
            title: 'What is the population of New York?',
            description: 'Ask me about anything',
          },
        ]}
        onSuggestionClick={async (suggestion) => {
          if (chatId)
            await studentUpdateChatTitle({
              chatId,
              title: suggestion,
            })
          else
            await studentCreateNewChatAndRedirect({
              title: suggestion,
              chatType: 'free_chat',
              insertMessage: true,
            })
          setConversation((currentConversation) => [
            ...currentConversation,
            {
              id: generateId(),
              role: 'user',
              display: (
                <Message
                  sender={'user'}
                  time={new Date().toDateString()}
                  isUser={true}
                >
                  <ViewMarkdown markdown={suggestion} />
                </Message>
              ),
            },
          ])
          await runUserMessage({
            input: suggestion,
            setConversation,
            continueFreeChatConversation,
            chatId,
          })
          setIsLoading(false)
        }}
      />
    </div>
  </div>
)

const ChatList: React.FC<{ messages: UIState }> = ({ messages }) => (
  <div className="relative px-4">
    {messages.map((message, index) => (
      <div key={index} className="flex flex-col gap-2">
        {message.display}
      </div>
    ))}
  </div>
)