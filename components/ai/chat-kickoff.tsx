"use client"

import { useTranslations } from 'next-intl'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'

// A task longer than this is pointed at rather than repeated: the opener
// should put the student on the rails, not re-print a long brief.
const MAX_INLINE_TASK_CHARS = 600
const MAX_INLINE_DESCRIPTION_CHARS = 300

/**
 * The tutor's opening message. It is rendered, never sent: it costs no model
 * call, does not count as a turn and is not stored, so it shows on every
 * visit — including after a restart — and the student's first message can be
 * real work instead of a "hi". The model is told it was shown
 * (`CHAT_KICKOFF_NOTE` in lib/ai/prompts.ts).
 */
export function ChatKickoff({ text }: { text: string }) {
  return (
    <Message from="assistant">
      <MessageContent>
        <MessageResponse>{text}</MessageResponse>
      </MessageContent>
    </Message>
  )
}

/** Opening message for an AI lesson task (student chat and editor preview). */
export function useLessonKickoff({ task, requirementsCount = 0 }: { task: string; requirementsCount?: number }) {
  const t = useTranslations('aiKickoff')
  const trimmed = task.trim()
  return [
    t('lessonGreeting'),
    trimmed && trimmed.length <= MAX_INLINE_TASK_CHARS
      ? `${t('taskHeading')}\n\n${trimmed}`
      : trimmed ? t('taskAbove') : '',
    requirementsCount > 0 ? t('requirements', { count: requirementsCount }) : '',
    t('lessonStart'),
  ].filter(Boolean).join('\n\n')
}

/** Opening message for an AI-coached exercise (student chat and editor preview). */
export function useExerciseKickoff({ title, description }: { title?: string | null; description?: string | null }) {
  const t = useTranslations('aiKickoff')
  const name = title?.trim()
  const summary = description?.trim()
  return [
    name ? t('exerciseGreeting', { title: name }) : t('exerciseGreetingGeneric'),
    summary && summary.length <= MAX_INLINE_DESCRIPTION_CHARS ? summary : '',
    t('exerciseInstructions'),
    t('exerciseStart'),
  ].filter(Boolean).join('\n\n')
}
