import { Loader } from 'lucide-react'
import { Suspense } from 'react'

import { getScopedI18n } from '@/app/locales/server'
import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import ListOfReviews from '@/components/dashboards/Common/reviews/ListOfReviews'
import LessonsTimeLine from '@/components/dashboards/student/course/lessons/LessonsTimeLine'
import TableOfContents from '@/components/dashboards/student/course/lessons/LessonTableOfContent'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

async function SidebarLessons({
    courseId,
    lessonId,
    lessonData,
}: {
    courseId: number
    lessonId: number
    lessonData: any
}) {
    const t = await getScopedI18n('SidebarLessons')

    return (
        <Tabs
            defaultValue="comments"
            className="w-full flex items-center justify-center flex-col h-auto"
        >
            <TabsList className="flex-col md:flex-row md:flex-wrap gap-2 h-auto md:gap-4 w-full md:w-auto mx-0 md:mx-3">
                <TabsTrigger value="comments">
                    {t('comments')}
                </TabsTrigger>
                <TabsTrigger value="timeline">
                    {t('timeline')}
                </TabsTrigger>
                <TabsTrigger value="tableOfContents">
                    {t('tableOfContents')}
                </TabsTrigger>
                <TabsTrigger value="reviews">
                    {t('reviews')}
                </TabsTrigger>
            </TabsList>
            <TabsContent
                className="overflow-auto w-full p-4 md:p-6 flex flex-col gap-4 max-w-[100%]"
                value="comments"
            >
                <Suspense fallback={
                    <div className="flex items-center justify-center h-32">
                        <Loader size={32} />
                    </div>
                }
                >
                    <CommentsSections
                        course_id={courseId}
                        lesson_id={lessonId}
                        lesson_comments={lessonData.lesson_comments}
                    />
                </Suspense>
            </TabsContent>
            <TabsContent className="p-4 md:p-6" value="timeline">
                <LessonsTimeLine courseId={courseId} lessonId={lessonId} />
            </TabsContent>
            <TabsContent className="p-4 md:p-6" value="tableOfContents">
                <TableOfContents markdown={lessonData.content} />
            </TabsContent>
            <TabsContent
                className="p-4 md:p-6 flex flex-col gap-4"
                value="reviews"
            >
                <Suspense fallback={
                    <div className="flex items-center justify-center h-32">
                        <Loader size={32} />
                    </div>
                }
                >
                    <ListOfReviews entityId={lessonId} entityType="lessons" />
                </Suspense>
            </TabsContent>
        </Tabs>
    )
}

export default SidebarLessons
