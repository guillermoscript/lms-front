'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AI_SETTINGS_PATH, type AiErrorCode } from '@/lib/ai/error-codes'
import { parseAiChatError, isAiSetupErrorKind } from '@/lib/ai/chat-error'

/**
 * Who is looking at the error. Decides the copy:
 *  - student: "Your school hasn't enabled AI yet."
 *  - teacher: "Ask your school admin."
 *  - admin (`canConfigure`): says what to fix and links to AI settings.
 * `canConfigure` always wins over `audience`: the server only sets it for a
 * school admin, so an admin on a student surface still gets the actionable copy.
 */
export type AiErrorAudience = 'student' | 'teacher'

/** Prefix an in-app path with the active locale, leaving already-prefixed paths alone. */
function localized(path: string, locale: string): string {
    return /^\/(en|es)(\/|$)/.test(path) ? path : `/${locale}${path}`
}

interface AiErrorNoticeProps {
    code: AiErrorCode
    /** From the response body (`error.canConfigure`): true only for a school admin. */
    canConfigure: boolean
    /** From the response body (`error.settingsUrl`); defaults to the AI settings page. */
    settingsUrl?: string | null
    audience?: AiErrorAudience
    className?: string
    /** Optional trailing control (for example a Retry button). */
    children?: React.ReactNode
}

/**
 * Shared, inline error for "the school's AI setup is the problem" responses
 * (`ai_not_configured | ai_key_invalid | ai_model_unsupported | ai_quota |
 * ai_provider_error`). Never shows provider text: the server sends codes only.
 */
export function AiErrorNotice({
    code,
    canConfigure,
    settingsUrl,
    audience = 'student',
    className,
    children,
}: AiErrorNoticeProps) {
    const t = useTranslations('aiErrorNotice')
    const locale = useLocale()
    const role = canConfigure ? 'admin' : audience

    return (
        <div
            role="alert"
            data-testid="ai-error-notice"
            data-code={code}
            className={cn(
                'flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive',
                className,
            )}
        >
            <span className="min-w-0">
                {t(`${role}.${code}`)}
                {canConfigure && (
                    <>
                        {' '}
                        <Link
                            href={localized(settingsUrl || AI_SETTINGS_PATH, locale)}
                            className="font-medium underline underline-offset-2"
                        >
                            {t('configure')}
                        </Link>
                    </>
                )}
            </span>
            {children}
        </div>
    )
}

interface UseAiChatErrorOptions {
    audience?: AiErrorAudience
    /** Shown for anything that is not a recognised limit or AI setup error. */
    genericMessage: string
}

/**
 * `onError` handler for `useChat` that toasts the right message:
 * rate/usage limits (`aiChatLimits`), AI setup problems (`aiErrorNotice`, with
 * an "Open AI settings" action for admins), else `genericMessage`.
 */
export function useAiChatErrorToast({ audience = 'student', genericMessage }: UseAiChatErrorOptions) {
    const tLimits = useTranslations('aiChatLimits')
    const tNotice = useTranslations('aiErrorNotice')
    const locale = useLocale()
    const router = useRouter()

    return useCallback(
        (error: unknown) => {
            const info = parseAiChatError(error)
            if (info.kind === 'generic') {
                toast.error(genericMessage)
                return
            }
            if (!isAiSetupErrorKind(info.kind)) {
                toast.error(tLimits(info.kind))
                return
            }
            const role = info.canConfigure ? 'admin' : audience
            toast.error(tNotice(`${role}.${info.kind}`), {
                action:
                    info.canConfigure && info.settingsUrl
                        ? {
                              label: tNotice('configure'),
                              onClick: () => {
                                  router.push(localized(info.settingsUrl as string, locale))
                              },
                          }
                        : undefined,
            })
        },
        [audience, genericMessage, tLimits, tNotice, locale, router],
    )
}
