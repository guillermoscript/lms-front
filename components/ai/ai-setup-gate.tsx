import { getTenantAiEnabled } from '@/lib/ai/ui-flags'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { AiErrorNotice, type AiErrorAudience } from '@/components/ai/ai-error-notice'

interface AiSetupGateProps {
    children: React.ReactNode
    /**
     * `hide` (default) renders nothing while the school has no AI key, for
     * optional entry points. `notice` renders the "AI isn't set up" message in
     * place of the chat, for surfaces that are only a chat.
     */
    whenOff?: 'hide' | 'notice'
    audience?: AiErrorAudience
    className?: string
}

/**
 * Setup comes before chatting: children render only when the school has an
 * active AI key. UI convenience, not a gate; AI routes still answer with a
 * typed error (`ai_not_configured`).
 */
export async function AiSetupGate({ children, whenOff = 'hide', audience = 'student', className }: AiSetupGateProps) {
    if (await getTenantAiEnabled()) return <>{children}</>
    if (whenOff === 'hide') return null
    const role = await getUserRole()
    return (
        <AiErrorNotice
            code="ai_not_configured"
            canConfigure={role === 'admin'}
            audience={audience}
            className={className}
        />
    )
}
