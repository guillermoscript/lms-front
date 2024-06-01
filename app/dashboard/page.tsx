
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import Sidebar from '@/components/dashboard/Sidebar'
import CourseCards from '@/components/dashboard/cards/CourseCards'
import NewsCards from '@/components/dashboard/cards/NewsCards'
import TestCards from '@/components/dashboard/cards/TestsCards'

export default async function Dashboard () {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
      <Sidebar />
      <div className="flex flex-col">
        <DashboardHeader />
        <main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-6">
          <NewsCards />
          {/* You might add other cards or components here following similar pattern */}
          <CourseCards />
          <TestCards />
        </main>
      </div>
    </div>
  )
}
