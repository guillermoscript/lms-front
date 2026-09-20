"use client"

import { useState, type ComponentProps } from 'react'
import { useTranslations } from 'next-intl'
import { useChat } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { IconRobot, IconPlayerPlay, IconRotateClockwise2, IconSparkles } from '@tabler/icons-react'
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
import { Shimmer } from '@/components/ai-elements/shimmer'
import { LessonCompletionCard } from '@/components/ai/lesson-completion-card'
import { findLessonCompletion, lessonCompletionOutput } from '@/lib/ai/lesson-completion'
import { classifyAiChatError } from '@/lib/ai/chat-error'
import { DefaultChatTransport } from 'ai'
import {
  ChatAttachButton,
  ChatAttachmentsPreview,
  MessageImageParts,
  useChatAttachmentInputProps,
} from '@/components/ai/chat-attachments'
import { useAiChatSubmit } from '@/hooks/use-ai-chat-submit'
import type { StructuredRequirements } from '@/lib/ai/lesson-requirements'

interface AIPreviewModalProps {
  type: 'lesson' | 'exercise'
  config: {
    task_description?: string
    system_prompt?: string
    instructions?: string
    /** Structured task draft (#806) — when set, takes over the whole prompt, same as a saved row with `requirements` set. */
    requirements?: StructuredRequirements | null
    /** Exercise draft — same context the student's coach gets. */
    exercise?: { title?: string; description?: string }
    /** Lesson draft the tutor grounds itself in — same context a student's tutor gets. */
    lesson?: { title?: string; description?: string; content?: string }
  }
}

// The exercise coach's dry-run `markExerciseCompleted`, once it has answered.
function exerciseCompletion(part: { type: string; state?: string; output?: unknown }) {
  if (part.type !== 'tool-markExerciseCompleted' || part.state !== 'output-available') return null
  return (part.output ?? {}) as { success?: boolean; feedback?: string; score?: number }
}

function InnerAIPreviewModal({ type, config }: AIPreviewModalProps) {
  const t = useTranslations('dashboard.teacher.aiPreview')
  const tChatLimits = useTranslations('aiChatLimits')
  const [open, setOpen] = useState(false)
  const { textInput } = usePromptInputController()

  // What a student might actually say — including the two that must NOT work.
  const suggestions = [
    t('suggestions.start'),
    t('suggestions.confused'),
    t('suggestions.giveAnswer'),
    t('suggestions.claimDone')
  ]

  const endpoint = type === 'lesson'
    ? '/api/teacher/preview/lesson-task'
    : '/api/teacher/preview/exercise'

  // useChat keeps its first transport, so a transport-level `body` froze the
  // prompts at mount: edits made after opening the preview were never sent.
  // The draft travels with each request instead.
  const [transport] = useState(() => new DefaultChatTransport({ api: endpoint }))
  const { messages, sendMessage: send, setMessages, status, stop, error, clearError, regenerate } = useChat({ transport })
  const sendMessage = (message: Parameters<typeof send>[0]) => send(message, { body: config })
  const errorKind = error ? classifyAiChatError(error) : 'generic'

  const isBusy = status === 'submitted' || status === 'streaming'
  const isCompleted = Boolean(findLessonCompletion(messages)) || messages.some((message) => message.parts.some((part) => exerciseCompletion(part)?.success))

  const handleRestart = () => {
    stop()
    clearError()
    setMessages([])
  }

  const handleTest = () => {
    setOpen(true)
  }

  const attachmentInputProps = useChatAttachmentInputProps()
  const handleSubmit = useAiChatSubmit({ sendMessage, clearInput: textInput.clear, disabled: isCompleted })

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage({ text: suggestion });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleTest}
        className="gap-2"
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
                <div className="w-9 h-9 rounded-lg bg-brand-tint flex items-center justify-center">
                  <IconRobot className="h-5 w-5 text-brand-text" />
                </div>
                <div>
                  <h2 className="font-semibold text-base leading-none mb-0.5">{t('modalTitle')}</h2>
                  <p className="text-xs text-muted-foreground">{t('modalSubtitle')}</p>
                </div>
              </div>
              {/* pr-8 keeps clear of the dialog's own close button */}
              <div className="flex items-center gap-2 pr-8">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 rounded-lg border border-warning/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning motion-safe:animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
                    {t('previewSession')}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleRestart}
                  disabled={messages.length === 0 && !error}
                  aria-label={t('restartAria')}
                >
                  <IconRotateClockwise2 aria-hidden="true" className="h-4 w-4" />
                  {t('restart')}
                </Button>
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
                  <Message key={message.id} from={message.role as ComponentProps<typeof Message>['from']}>
                    <MessageContent>
                      <MessageImageParts parts={message.parts} />
                      {message.parts.map((part, index) => {
                        if (part.type === 'text') {
                          return <MessageResponse key={index}>{part.text}</MessageResponse>
                        }
                        const completion = lessonCompletionOutput(part)
                        if (completion?.success) {
                          return (
                            <LessonCompletionCard
                              key={index}
                              title={t('completedTitle')}
                              feedback={completion.feedback}
                              note={t('completedNote')}
                            />
                          )
                        }
                        const graded = exerciseCompletion(part)
                        if (graded?.success) {
                          return (
                            <LessonCompletionCard
                              key={index}
                              title={`${t('completedTitle')} · ${t('scoreLabel', { score: graded.score ?? 0 })}`}
                              feedback={graded.feedback}
                              note={t('completedNote')}
                            />
                          )
                        }
                        return null
                      })}
                    </MessageContent>
                  </Message>
                ))}
                {status === 'submitted' && (
                  <Message from="assistant">
                    <MessageContent>
                      <Shimmer className="text-sm">{t('generating')}</Shimmer>
                    </MessageContent>
                  </Message>
                )}
                {error && (
                  <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <span>{errorKind === 'generic' ? t('error') : tChatLimits(errorKind)}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => { clearError(); regenerate({ body: config }) }}>
                      {t('retry')}
                    </Button>
                  </div>
                )}
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

              <PromptInput onSubmit={handleSubmit} {...attachmentInputProps}>
                <ChatAttachmentsPreview />
                <PromptInputBody>
                  <PromptInputTextarea
                    placeholder={isCompleted ? t('placeholderCompleted') : t('placeholder')}
                    className="min-h-[60px]"
                    disabled={isCompleted}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <ChatAttachButton disabled={isBusy || isCompleted} />
                  </PromptInputTools>
                  {!isCompleted && (
                    <PromptInputSubmit status={status as ComponentProps<typeof PromptInputSubmit>['status']} />
                  )}
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
