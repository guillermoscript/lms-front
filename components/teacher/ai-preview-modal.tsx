"use client"

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { IconRobot, IconPlayerPlay } from '@tabler/icons-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  PromptInput,
  PromptInputProvider,
  usePromptInputController,
  Message,
  MessageContent,
  MessageResponse,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools
} from '@/components/ai-elements'
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { DefaultChatTransport } from 'ai'

interface AIPreviewModalProps {
  type: 'lesson' | 'exercise'
  config: {
    task_description?: string
    system_prompt?: string
    instructions?: string
  }
}

const suggestions = [
  "How does this configuration affect responses?",
  "Give me a sample student question",
  "Is the tone appropriate?",
  "Test a completion trigger"
]

function InnerAIPreviewModal({ type, config }: AIPreviewModalProps) {
  const [open, setOpen] = useState(false)
  const { textInput } = usePromptInputController()

  const endpoint = type === 'lesson'
    ? '/api/teacher/preview/lesson-task'
    : '/api/teacher/preview/exercise'

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: endpoint,
      body: {
        ...config
      }
    }),
  })

  const handleTest = () => {
    setOpen(true)
  }

  const handleSubmit = (message: any) => {
    if (!message.text.trim()) return
    sendMessage({
      text: message.text,
    })
    textInput.clear()
  }

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage({ text: suggestion });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleTest}
        className="gap-2 shadow-sm hover:shadow transition-all"
      >
        <IconPlayerPlay className="h-4 w-4" />
        Preview AI Behavior
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0 overflow-hidden bg-background">
          <div className="flex flex-col h-full divide-y overflow-hidden">
            <div className="px-6 py-4 bg-muted/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <IconRobot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg leading-none mb-1">AI Preview Mode</h2>
                  <p className="text-sm text-muted-foreground">Testing your configuration in real-time</p>
                </div>
              </div>
            </div>

            <Conversation className="flex-1 bg-background/50">
              <ConversationContent>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center min-h-full text-muted-foreground p-8 text-center bg-muted/5">
                    <IconRobot className="h-12 w-12 mb-4 opacity-20" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Ready to Preview</h3>
                    <p className="max-w-xs mx-auto">This simulates a student session with your current prompts. Start by asking a question.</p>
                  </div>
                )}

                {messages.map((message) => (
                  <Message key={message.id} from={message.role as any}>
                    <MessageContent>
                      {message.parts.map((part, index) => {
                        if (part.type === 'text') {
                          return <MessageResponse key={index}>{part.text}</MessageResponse>
                        }
                        return null
                      })}
                    </MessageContent>
                  </Message>
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="grid shrink-0 gap-4 pt-4 bg-background px-6 pb-6">
              <Suggestions>
                {suggestions.map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    suggestion={suggestion}
                  />
                ))}
              </Suggestions>

              <PromptInput onSubmit={handleSubmit}>
                <PromptInputBody>
                  <PromptInputTextarea
                    placeholder="Type your test message here..."
                    className="min-h-[60px]"
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <div className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md text-[10px] font-bold uppercase tracking-wider text-muted-foreground border">
                      Preview Session
                    </div>
                  </PromptInputTools>
                  <PromptInputSubmit status={status as any} />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AIPreviewModal(props: AIPreviewModalProps) {
  return (
    <PromptInputProvider>
      <InnerAIPreviewModal {...props} />
    </PromptInputProvider>
  )
}
