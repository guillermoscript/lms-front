import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AristotleProvider } from '@/components/aristotle/aristotle-provider'
import { AristotleTrigger } from '@/components/aristotle/aristotle-trigger'
import dynamic from 'next/dynamic'

const AristotlePanel = dynamic(
  () => import('@/components/aristotle/aristotle-panel').then(m => m.AristotlePanel),
)
import { AristotleContextSetter } from '@/components/aristotle/aristotle-context-setter'

interface LayoutProps {
    children: React.ReactNode
    params: Promise<{ courseId: string }>
}

export default async function StudentCourseLayout({ children, params }: LayoutProps) {
    const { courseId } = await params
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const numericCourseId = parseInt(courseId)

    // Check if Aristotle is enabled and get persona
    const { data: tutorConfig } = await supabase
        .from('course_ai_tutors')
        .select('enabled, persona')
        .eq('course_id', numericCourseId)
        .eq('tenant_id', tenantId)
        .single()

    const isEnabled = tutorConfig?.enabled ?? false

    // Extract a display name from persona if present (first sentence or first few words)
    let personaName: string | null = null
    if (tutorConfig?.persona) {
        const match = tutorConfig.persona.match(/(?:you are|i am|name is|call me)\s+([^,.!]+)/i)
        if (match) {
            personaName = match[1].trim().split(/\s+/).slice(0, 4).join(' ')
        }
    }

    return (
        <AristotleProvider courseId={numericCourseId} isEnabled={isEnabled} personaName={personaName}>
            <AristotleContextSetter />
            {children}
            <AristotleTrigger />
            <AristotlePanel />
        </AristotleProvider>
    )
}
