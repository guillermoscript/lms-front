import { SupabaseClient } from '@supabase/supabase-js'
import { BookTextIcon } from 'lucide-react'

import { getScopedI18n } from '@/app/locales/server'
import AllCoursesCard from '@/components/dashboards/student/course/AllCoursesCard'
import CourseCard from '@/components/dashboards/student/course/CourseCard'
import { Skeleton } from '@/components/ui/skeleton'

import NoCoruseOrSubAlert from '../NoCoruseOrSubAlert'

interface CourseSectionProps {
    userCourses: any[]
    userSubscriptions: any[]
    userId: string
    supabase: SupabaseClient
    layoutType: 'flex' | 'grid'
}

const CourseSectionComponent: React.FC<CourseSectionProps> = async ({ userCourses, userSubscriptions, userId, supabase, layoutType }) => {
    const t = await getScopedI18n('courseSectionComponent')

    return (
        <>
            {userSubscriptions?.length > 0 ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <BookTextIcon className='h-6 w-6' />
                        <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                            {t('title')}
                        </h2>
                    </div>
                    <div className={`${layoutType === 'flex' ? 'flex flex-wrap gap-4 w-full' : 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'}`}>
                        <AllCoursesCard userId={userId} supabase={supabase} />
                    </div>
                </div>
            ) : userCourses?.length > 0 ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <BookTextIcon className='h-6 w-6' />
                        <h2 className="text-xl font-semibold text-primary-500 dark:text-primary-400">
                            Your Courses
                        </h2>
                    </div>
                    <div className={`${layoutType === 'flex' ? 'flex flex-wrap gap-4 w-full' : 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'}`}>
                        {userCourses.map((course) => (
                            <CourseCard
                                key={course.course_id}
                                title={course.course.title}
                                img={course.course.thumbnail_url}
                                description={course.course.description}
                                courseId={course.course_id}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <NoCoruseOrSubAlert />
            )}
        </>
    )
}

export async function CourseSectionComponentLoading() {
    return (
        <div className="p-4 flex w-full gap-4">
            <Skeleton className='w-full md:w-1/2 h-48' />
            <Skeleton className='w-full md:w-1/2 h-48' />
            <Skeleton className='w-full md:w-1/2 h-48' />
        </div>
    )
}

export default CourseSectionComponent
