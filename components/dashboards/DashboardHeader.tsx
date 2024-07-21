import { SearchIcon } from 'lucide-react'

import { DarkThemeToggle } from '@/components/DarkThemeToggle'
import { CommandDialogComponent } from '@/components/dashboards/Common/CommandDialogComponent'
import { Input } from '@/components/ui/input'
import { getServerUserRole } from '@/utils/supabase/getUserRole'

import DashboardHeaderSheet from './Common/DashboardHeaderSheet'
import ProfileDropdown from './Common/ProfileDropdown'
import Notifications from './notifications/Notifications'
import StudentOnBoarding from './student/tour/StudentOnBoarding'

export default async function DashboardHeader () {
    const userRole = await getServerUserRole()

    return (
        <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
            <DashboardHeaderSheet userRole={userRole} />
            <div className="w-full flex-1">
                <form>
                    <div className="relative md:w-2/3 lg:w-1/3">
                        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />

                        <Input
                            className="w-full bg-white shadow-none appearance-none pl-8  dark:bg-gray-950"
                            placeholder="Search lessons, courses, or students..."
                            type="search"
                        />
                        <div className="absolute right-2.5 top-2.5">
                            <CommandDialogComponent />
                        </div>
                    </div>
                </form>
            </div>
            <StudentOnBoarding />
            <Notifications />
            <DarkThemeToggle />
            <ProfileDropdown />
        </header>
    )
}
