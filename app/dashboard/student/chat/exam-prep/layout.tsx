import { AI } from '@/actions/dashboard/ExamPreparationActions'

export default function ExamPrepChatLayout ({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <AI>{children}</AI>
        </>
    )
}
