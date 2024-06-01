import DashboardHeader from '@/components/dashboards/DashboardHeader'
import Sidebar from '@/components/dashboards/Sidebar'

export default function Layout ({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
            <Sidebar />
            <div className="flex flex-col">
                <DashboardHeader />
                <main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-6">
                    {children}
                </main>
            </div>
        </div>
    )
}
