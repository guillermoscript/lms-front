import dayjs from 'dayjs'
import { User2 } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

import CommentEditor from '../student/course/lessons/CommentEditor'

export default async function CommentsSections ({
    lesson_id,
    lesson_comments
}: {
    lesson_id: number
    lesson_comments: Array<Tables<'lesson_comments'>>
}) {
    const supabase = createClient()
    const usersIds = lesson_comments.map((comment) => comment.user_id)
    const profiles = await supabase
        .from('profiles')
        .select('*')
        .in('id', usersIds)

    if (profiles.error != null) {
        console.log(profiles.error)
        throw new Error(profiles.error.message)
    }

    return (
        <div className="flex flex-col gap-4">
            {lesson_comments?.map((comment) => (
                <CommentCard
                    key={comment.id}
                    name={profiles.data[comment.user_id]?.full_name || 'Unknown'}
                    comment={comment.content}
                    date={dayjs(comment.created_at).format('DD/MM/YYYY: HH:mm')}
                />
            ))}
            <Card>
                <CardHeader>
                    <Avatar>
                        <AvatarImage src="/img/favicon.png" alt="profile" />
                        <AvatarFallback>
                            <User2 className="h-6 w-6" />
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
            <CardHeader className="flex p-2 flex-row flex-wrap items-baseline gap-2">
                <Avatar>
                    <AvatarImage src="/img/favicon.png" alt="profile" />
                    <AvatarFallback>{name[0]}</AvatarFallback>
                </Avatar>
                <CardTitle className="text-lg font-medium">{name}</CardTitle>
                <CardDescription className="text-xs text-gray-400">
                    {date}
                </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent
                className='p-4'
            >
                <div className="flex flex-col">
                    <div className="flex items-center gap-2"></div>
                    <ViewMarkdown markdown={comment} />
                </div>
            </CardContent>
        </Card>
    )
}
