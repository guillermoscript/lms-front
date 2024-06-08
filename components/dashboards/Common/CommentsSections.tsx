import dayjs from 'dayjs'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
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
                    date={dayjs(comment.created_at).format('DD/MM/YYYY: HH:mm')}
                />
            ))}
            <Card>
                <CardHeader>
                    <Avatar>
                        <AvatarImage src="/img/favicon.png" alt="profile" />
                        <AvatarFallback>
                            {'test'[0]}
                        </AvatarFallback>
                    </Avatar>
                    <CardTitle className="text-lg font-medium">Add a Comment</CardTitle>
                </CardHeader>
                <CardContent>
                    <CommentEditor lesson_id={lesson_id} />
                </CardContent>
            </Card>
        </div>
    )
}

const CommentCard = ({
    name,
    comment,
    date
}: {
    name: string
    comment: string
    date: string
}) => {
    return (
        <Card>
            <CardHeader>
                <Avatar>
                    <AvatarImage src="/img/favicon.png" alt="profile" />
                    <AvatarFallback>{name[0]}</AvatarFallback>
                </Avatar>
                <CardTitle className="text-lg font-medium">{name}</CardTitle>
                <CardDescription className="text-xs text-gray-400">
                    {date}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col">
                    <div className="flex items-center gap-2"></div>
                    <ViewMarkdown markdown={comment} />
                </div>
            </CardContent>
        </Card>
    )
}
