'use client'

import { useCallback } from 'react'
import type { FileUIPart } from 'ai'
import { hasSubmittableContent, prepareChatFiles, type ChatSubmission } from '@/lib/ai/attachments-client'

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
 * lose keystrokes), shrink images, then send text + files together.
 */
export function useAiChatSubmit({ sendMessage, clearInput, disabled }: Options) {
    return useCallback(
        async (message: ChatSubmission) => {
            if (disabled || !hasSubmittableContent(message)) return
            clearInput()
            const files = await prepareChatFiles(message.files)
            await sendMessage({ text: message.text ?? '', files })
        },
        [sendMessage, clearInput, disabled]
    )
}
