import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tables } from '@/utils/supabase/supabase'

import CommentEditor from '../student/course/lessons/CommentEditor'

export default function CommentsSections ({
    lesson_id,
    lesson_comments
}: {
    lesson_id: number
    lesson_comments: Array<Tables<'lesson_comments'>>
}) {
    return (
        <div className="flex flex-col gap-4">
            {lesson_comments?.map((comment) => (
                <CommentCard
                    key={comment.id}
                    name={'test'}
                    comment={comment.content}
                />
            ))}
            <div className="mt-4">
                <h3 className="text-lg font-medium">Add a Comment</h3>
                <CommentEditor lesson_id={lesson_id} />
            </div>
        </div>
    )
}

const CommentCard = ({ name, comment }: { name: string, comment: string }) => (
    <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
        <div className="flex items-start gap-4">
            <Avatar>
                <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                />
                <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <div>
                <h4 className="font-medium">{name}</h4>
                <ViewMarkdown markdown={comment} />
            </div>
        </div>
    </div>
)
