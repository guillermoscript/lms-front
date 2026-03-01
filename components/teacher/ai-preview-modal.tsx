"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useChat } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { IconRobot, IconPlayerPlay, IconSparkles } from '@tabler/icons-react'
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

function InnerAIPreviewModal({ type, config }: AIPreviewModalProps) {
  const t = useTranslations('dashboard.teacher.aiPreview')
  const [open, setOpen] = useState(false)
  const { textInput } = usePromptInputController()

  const suggestions = [
    t('suggestions.affect'),
    t('suggestions.sample'),
    t('suggestions.tone'),
    t('suggestions.trigger')
  ]

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
        {t('buttonText')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[90vw] !w-[900px] h-[90vh] max-h-[850px] p-0 gap-0 overflow-hidden bg-background">
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <IconRobot className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-base leading-none mb-0.5">{t('modalTitle')}</h2>
                  <p className="text-xs text-muted-foreground">{t('modalSubtitle')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {t('previewSession')}
                </span>
              </div>
            </div>

            {/* Chat area */}
            <Conversation className="flex-1 bg-muted/10">
              <ConversationContent>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center min-h-full text-muted-foreground p-12 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
                      <IconSparkles className="h-10 w-10 opacity-30" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{t('readyTitle')}</h3>
                    <p className="text-sm max-w-sm mx-auto leading-relaxed">{t('readyDesc')}</p>
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

            {/* Input area */}
            <div className="grid shrink-0 gap-4 pt-4 bg-background px-6 pb-6 border-t">
              {messages.length === 0 && (
                <Suggestions>
                  {suggestions.map((suggestion) => (
                    <Suggestion
                      key={suggestion}
                      onClick={() => handleSuggestionClick(suggestion)}
                      suggestion={suggestion}
                    />
                  ))}
                </Suggestions>
              )}

              <PromptInput onSubmit={handleSubmit}>
                <PromptInputBody>
                  <PromptInputTextarea
                    placeholder={t('placeholder')}
                    className="min-h-[60px]"
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools />
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
