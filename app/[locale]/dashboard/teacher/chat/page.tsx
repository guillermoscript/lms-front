import { getScopedI18n } from '@/app/locales/server'
import ChatContent from '@/components/dashboards/chat/Chatsv2/ChatContent'
import ExamLink from '@/components/dashboards/chat/ExamLink'
import FreeChatSetup from '@/components/dashboards/chat/tour/FreeChatSetup'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function ChatPage() {
    const t = await getScopedI18n('BreadcrumbComponent')

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/teacher', label: 'Teacher' },
                    { href: '/dashboard/teacher/chat', label: 'Chat' },
                ]}
            />
            <div className="flex flex-col gap-4 w-full mb-8">
                <div className="flex flex-wrap gap-4 w-full items-center">
                    <FreeChatSetup />
                </div>
                <div className="flex flex-wrap gap-4 w-full">
                    <ExamLink />
                </div>
            </div>
            <ChatContent
                chatType="free_chat"
            />
        </>
    )
}
