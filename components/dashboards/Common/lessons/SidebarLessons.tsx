import { Suspense } from 'react'

import CommentsSections from '@/components/dashboards/Common/CommentsSections'
import ListOfReviews from '@/components/dashboards/Common/reviews/ListOfReviews'

import LessonsTimeLine from '@/components/dashboards/student/course/lessons/LessonsTimeLine'
import TableOfContents from '@/components/dashboards/student/course/lessons/LessonTableOfContent'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function SidebarLessons({
    courseId,
    lessonId,
    lessonData,
}: {
    courseId: number
    lessonId: number
    lessonData: any
}) {
    return (
        <Tabs
            defaultValue="comments"
            className="w-full flex items-center justify-center flex-col h-auto"
        >
            <TabsList className="flex-col md:flex-row md:flex-wrap gap-2 h-auto md:gap-4 w-full md:w-auto mx-0 md:mx-3">
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="tableOfContents">
                    Table of Contents
                </TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>
            <TabsContent value="comments">
                <Suspense fallback={<div>Loading...</div>}>
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
                <ListOfReviews entityId={lessonId} entityType="lessons" />
            </TabsContent>
        </Tabs>
    )
}

export default SidebarLessons