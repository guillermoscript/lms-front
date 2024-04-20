import DashboardHeader from "@/components/dashboard/DashboardHeader"
import Sidebar from "@/components/dashboard/Sidebar"
import SidebarLink from "@/components/dashboard/SidebarLink"
import { BookIcon, ClipboardIcon } from "lucide-react"

export default function LayoutCourse({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
			<Sidebar>
                <SidebarLink icon={BookIcon} text="Lessons" href="/dashboard/lessons" />
                <SidebarLink icon={ClipboardIcon} text="Tests" href="#" />
            </Sidebar>
			<div className="flex flex-col">
				<DashboardHeader  />
				<main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-6">
					{children}
				</main>
			</div>
		</div>
    )
}