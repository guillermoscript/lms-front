'use client'

import { IconSparkles } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

/**
 * Contextual entry point to the lesson AI tutor (Duolingo "Explain my answer"
 * pattern). Dispatches a window event picked up by LessonAIChat, which opens
 * the chat (full-screen overlay on mobile) and sends the prompt.
 */
export function AskTutorChip() {
    const t = useTranslations('components.lessonAIChat.contextual')

    return (
        <div className="flex justify-start">
            <button
                type="button"
                onClick={() =>
                    window.dispatchEvent(
                        new CustomEvent('lesson-tutor:ask', {
                            detail: { prompt: t('prompt') },
                        })
                    )
                }
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]"
            >
                <IconSparkles className="h-4 w-4" />
                {t('chip')}
            </button>
        </div>
    )
}
