import StudentChatSidebar from '@/components/dashboards/chat/StudentChatSidebar'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    if (user.error != null) {
        throw new Error(user.error.message)
    }

    return (
        <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr] gap-6">
            <StudentChatSidebar userRole="student" />
            <div className="flex flex-col">{children}</div>
        </div>
    )
}
