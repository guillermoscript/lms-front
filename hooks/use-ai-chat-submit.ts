'use client'

import { useCallback } from 'react'
import type { FileUIPart } from 'ai'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
    hasSubmittableContent,
    prepareChatFiles,
    type ChatSubmission,
    type RejectedAttachment,
} from '@/lib/ai/attachments-client'

interface Options {
    /** `sendMessage` from `useChat`. */
    sendMessage: (message: { text: string; files?: FileUIPart[] }) => void | Promise<void>
    /** Clears the composer — `textInput.clear()` from `usePromptInputController`. */
    clearInput: () => void
    disabled?: boolean
}

/**
 * The one submit handler every AI chat shares: ignore empty turns, clear the
 * composer immediately (before the async image work, so fast typists do not
 * lose keystrokes), transcode and shrink images, then send text + files
 * together. Images that cannot travel are named out loud rather than
 * disappearing between the composer and the model.
 */
export function useAiChatSubmit({ sendMessage, clearInput, disabled }: Options) {
    const t = useTranslations('components.aiAttachments')

    return useCallback(
        async (message: ChatSubmission) => {
            if (disabled || !hasSubmittableContent(message)) return
            clearInput()

            const { files, rejected } = await prepareChatFiles(message.files)
            for (const item of rejected) toast.error(rejectionMessage(t, item))

            const text = message.text?.trim() ?? ''
            // Every image was rejected and there is nothing else to say — the toasts are the answer.
            if (!text && files.length === 0) return
            await sendMessage({ text: message.text ?? '', files })
        },
        [sendMessage, clearInput, disabled, t]
    )
}

function rejectionMessage(t: ReturnType<typeof useTranslations>, { filename, reason }: RejectedAttachment): string {
    const name = filename ?? t('thisImage')
    return reason === 'unsupported' ? t('errors.unsupported', { name }) : t('errors.tooLarge', { name })
}
