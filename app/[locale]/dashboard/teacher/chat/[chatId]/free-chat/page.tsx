import FreeChat from '@/components/dashboards/chat/FreeChat'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function FreeChatPage({
    params,
}: {
    params: {
        chatId: string
    }
}) {
    return (
        <>
            <FreeChat chatId={Number(params.chatId)} />
        </>
    )
}
