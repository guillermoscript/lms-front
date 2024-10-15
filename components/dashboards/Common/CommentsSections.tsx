import dayjs from 'dayjs'

import { getScopedI18n } from '@/app/locales/server'
import { createClient } from '@/utils/supabase/server'

import CommentEditor from '../student/course/lessons/CommentEditor'
import CommentCard from './comments/CommentsCard'

export default async function CommentsSections({
    lesson_id,
    course_id,
    lesson_comments,
}: {
    lesson_id: number
    course_id: number
    lesson_comments: any[]
}) {
    const supabase = createClient()
    const usersIds = lesson_comments.map((comment) => comment.user_id)
    const currentUser = await supabase.auth.getUser()
    const profiles = await supabase
        .from('profiles')
        .select('*')
        .in('id', usersIds)

    if (profiles.error != null) {
        console.log(profiles.error)
        throw new Error(profiles.error.message)
    }

    const t = await getScopedI18n('CommentsSections')

    return (
        <div className="flex flex-col gap-4 ">

            <CommentEditor
                course_id={course_id}
                lesson_id={lesson_id}
            />
            <h2 className="text-xl font-semibold mb-4">
                {t('comments')} ({lesson_comments.length})
            </h2>
            {lesson_comments
                .filter((comment) => comment.parent_comment_id === null)
                .map((comment) => {
                    const user = profiles.data.find(
                        (profile) => profile.id === comment.user_id
                    )
                    const isReactionPresent = comment?.comment_reactions?.find(
                        (reaction) =>
                            reaction.user_id === currentUser.data.user.id
                    )

                    return (
                        <CommentCard
                            key={comment.id}
                            comment={comment}
                            name={user?.full_name || 'Unknown'}
                            avatar={user?.avatar_url || '/img/favicon.png'}
                            isAuthor={
                                comment.user_id === currentUser.data.user.id
                            }
                            comment_reactions={comment.comment_reactions}
                            isReactionPresent={isReactionPresent}
                            date={dayjs(comment.created_at).format(
                                'DD/MM/YYYY: HH:mm'
                            )}
                            allComments={lesson_comments}
                            profiles={profiles.data} // Pass profiles data here
                            currentUser={currentUser.data.user}
                            course_id={course_id}
                        />
                    )
                })}
        </div>
    )
}
