import { FreeChatAI } from '@/actions/dashboard/AI/FreeChatPreparation'
import ExamLink from '@/components/dashboards/chat/ExamLink'
import FreeChat from '@/components/dashboards/chat/FreeChat'
import FreeChatSetup from '@/components/dashboards/chat/tour/FreeChatSetup'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export default async function ChatPage() {
    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: 'Dashboard' },
                    { href: '/dashboard/student', label: 'Student' },
                    { href: '/dashboard/student/chat', label: 'Chat' },
                ]}
            />
            <div className="flex flex-col gap-4 w-full mb-8">
                <div className="flex flex-wrap gap-4 w-full items-center">
                    <h1 className="text-2xl font-semibold">Select a chat or start a new one</h1>
                    <FreeChatSetup />
                </div>
                <div className="flex flex-wrap gap-4 w-full">
                    <ExamLink />
                </div>
            </div>
            <FreeChatAI>
                <FreeChat />
            </FreeChatAI>
        </>
    )
}
