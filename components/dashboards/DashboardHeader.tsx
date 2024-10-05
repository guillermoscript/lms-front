import Image from 'next/image'
import Link from 'next/link'

import { DarkThemeToggle } from '@/components/DarkThemeToggle'
import { getServerUserRole } from '@/utils/supabase/getUserRole'

import DashboardHeaderSheet from './Common/DashboardHeaderSheet'
import ProfileDropdown from './Common/ProfileDropdown'
import Notifications from './notifications/Notifications'
import StudentOnBoarding from './student/tour/StudentOnBoarding'

export default async function DashboardHeader () {
    const userRole = await getServerUserRole()

    return (
        <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
            <Link href="/">
                <Image
                    src="/img/logo.png"
                    alt="LMS"
                    width={85}
                    height={82}
                />
            </Link>
            <div className="flex flex-grow items-center justify-end gap-4">
                <DashboardHeaderSheet userRole={userRole} />
                <StudentOnBoarding />
                <Notifications />
                <div className="hidden md:flex gap-4">
                    <DarkThemeToggle />
                </div>
                <ProfileDropdown />
            </div>
        </header>
    )
}
