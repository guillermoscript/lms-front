import { KnowMeChatAI } from '@/actions/dashboard/AI/KnowMeActions'
import AIResponseDisplay from '@/components/dashboards/student/account/AIResponseDisplay'
import KnowMeChat from '@/components/dashboards/student/account/KnowMeChat'
import { LearningPreferencesForm } from '@/components/dashboards/student/account/LearningPreferenceForm'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function KnowMePage() {
    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return null
    }

    const profile = await supabase.from('profiles').select('data_person').eq('id', userData.data.user.id).single()

    if (profile.error) {
        return null
    }

    return (
        <KnowMeChatAI initialAIState={{ chatId: '', messages: [] }}>
            {
                profile.data.data_person ? (
                    <AIResponseDisplay
                        // @ts-expect-error
                        data={profile.data.data_person}
                        hideSubmit
                    />
                ) : (
                    <div>
                        <LearningPreferencesForm />
                        <KnowMeChat />
                    </div>
                )
            }
        </KnowMeChatAI>
    )
}
