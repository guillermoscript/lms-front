import ExamPrepChat from '@/components/dashboards/chat/ExamPrepChat'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function ExamnChatIdPage({
    params,
}: {
    params: {
        chatId: string
    }
}) {
    return <ExamPrepChat chatId={Number(params.chatId)} />
}
