'use client'

import { User } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Edit2, Flag, MessageSquare, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { addReactionToComment } from '@/actions/dashboard/studentActions'
import { useScopedI18n } from '@/app/locales/client'
import CommentEditor from '@/components/dashboards/student/course/lessons/CommentEditor'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tables } from '@/utils/supabase/supabase'

dayjs.extend(relativeTime)

const CommentCard = ({
    comment,
    name,
    avatar,
    date,
    isAuthor,
    comment_reactions,
    isReactionPresent,
    allComments,
    profiles,
    currentUser,
    course_id,
    depth = 0,
}: {
    comment: Tables<'lesson_comments'>
    name: string
    avatar: string
    date: string
    isAuthor: boolean
    comment_reactions?: Array<Tables<'comment_reactions'>>
    isReactionPresent?: Tables<'comment_reactions'>
    allComments: any[]
    profiles: Array<Tables<'profiles'>>
    currentUser: User
    course_id: number
    depth?: number
}) => {
    const [isEditing, setIsEditing] = useState(false)
    const [showReplyEditor, setShowReplyEditor] = useState(false)
    const [showReplies, setShowReplies] = useState(depth < 2)

    const t = useScopedI18n('CommentsSections')

    async function addReaction() {
        try {
            await addReactionToComment({
                commentId: comment.id,
                reactionType: 'like',
                isReactionPresent,
            })
            toast.success(t('CommentEditor.toast.success'))
        } catch (error) {
            console.error(error)
            toast.error(t('CommentEditor.toast.error'))
        }
    }

    const likeCount =
        comment_reactions?.filter((r) => r.reaction_type === 'like').length || 0
    const replies = allComments.filter(
        (reply) => reply.parent_comment_id === comment.id
    )

    return (
        <div className={`flex ${depth > 0 ? 'ml-4' : 'mt-4'}`}>
            <Avatar className="w-8 h-8 mt-1 mr-2 flex-shrink-0">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback>{name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <div className="bg-gray-100 rounded-2xl px-4 py-2 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                        <h4 className="text-sm font-semibold">{name}</h4>
                        <div className="flex items-center gap-2">
                            {isAuthor && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsEditing(!isEditing)}
                                >
                                    <Edit2 className="w-3 h-3 mr-1" />
                                    {t('edit')}
                                </Button>
                            )}
                            <Button variant="ghost" size="sm">
                                <Flag className="w-3 h-3 mr-1" />
                                {t('report')}
                            </Button>
                        </div>
                    </div>
                    {isEditing ? (
                        <CommentEditor
                            lesson_id={comment.lesson_id}
                            comment_id={comment.id}
                            course_id={course_id}
                            parent_comment_id={comment.parent_comment_id}
                            callback={() => setIsEditing(false)}
                        />
                    ) : (
                        <ViewMarkdown markdown={comment.content} />
                    )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={`p-0 h-auto font-semibold ${
                            isReactionPresent ? 'text-blue-600' : ''
                        }`}
                        onClick={addReaction}
                    >
                        {t('like')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="p-0 h-auto font-semibold"
                        onClick={() => setShowReplyEditor(!showReplyEditor)}
                    >
                        {t('reply')}
                    </Button>
                    <span>{dayjs(date).fromNow()}</span>
                    {likeCount > 0 && (
                        <div className="flex items-center">
                            <ThumbsUp className="w-3 h-3 text-blue-600 mr-1" />
                            {likeCount}
                        </div>
                    )}
                </div>
                {showReplyEditor && (
                    <div className="mt-2">
                        <CommentEditor
                            course_id={course_id}
                            lesson_id={comment.lesson_id}
                            parent_comment_id={comment.id}
                            callback={() => setShowReplyEditor(false)}
                        />
                    </div>
                )}
                {replies.length > 0 && (
                    <div className="mt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-auto text-xs font-semibold text-gray-500"
                            onClick={() => setShowReplies(!showReplies)}
                        >
                            {showReplies ? t('CommentCard.viewReplies') : t('CommentCard.viewReplies')}{' '}
                            ({replies.length})
                        </Button>
                        {showReplies && (
                            <div className="mt-2 overflow-x-auto whitespace-nowrap">
                                <div className="inline-flex space-x-4">
                                    {replies.map((reply) => {
                                        const replyUser = profiles.find(
                                            (profile) =>
                                                profile.id === reply.user_id
                                        )
                                        const isReplyAuthor =
                                            reply.user_id === currentUser.id

                                        return (
                                            <div
                                                key={reply.id}
                                                className="inline-block"
                                            >
                                                <CommentCard
                                                    comment={reply}
                                                    course_id={course_id}
                                                    name={
                                                        replyUser?.full_name ||
                                                        t('unknown')
                                                    }
                                                    avatar={
                                                        replyUser?.avatar_url ||
                                                        '/img/favicon.png'
                                                    }
                                                    date={reply?.created_at}
                                                    isAuthor={isReplyAuthor}
                                                    comment_reactions={
                                                        reply?.comment_reactions
                                                    }
                                                    isReactionPresent={reply?.comment_reactions?.find(
                                                        (reaction) =>
                                                            reaction.user_id ===
                                                            currentUser.id
                                                    )}
                                                    allComments={allComments}
                                                    profiles={profiles}
                                                    currentUser={currentUser}
                                                    depth={depth + 1}
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default CommentCard
