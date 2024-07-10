
import { AI } from '@/actions/dashboard/ExamPreparationActions'
import ExamPrepChat from '@/components/dashboards/student/chat/ExamPrepChat'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function ExamChatPage () {
    return (
        <>
            <AI initialAIState={{ chatId: '', messages: [] }}>
                <ExamPrepChat />
            </AI>
        </>
    )
}
