'use client'
import { User } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import { Edit3, Flag, Reply } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { addReactionToComment } from '@/actions/dashboard/studentActions'
import CommentEditor from '@/components/dashboards/student/course/lessons/CommentEditor'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Separator } from '@/components/ui/separator'
import { reactionTypes } from '@/utils/const'
import { Tables } from '@/utils/supabase/supabase'

const ReactionButton = ({ type, icon: Icon, count, onClick }) => (
    <button
        onClick={onClick}
        className="flex items-center gap-1 text-gray-600 hover:text-gray-800"
    >
        <Icon className={`w-5 h-5 ${type}`} />
        {count > 0 && <span className="text-xs text-gray-400">{count}</span>}
    </button>
)

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
    course_id
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
}) => {
    const [showReplies, setShowReplies] = useState(false)
    const [isEditing, setIsEditing] = useState(false)

    const toggleReplies = () => setShowReplies(!showReplies)
    const toggleEdit = () => setIsEditing(!isEditing)

    async function AddReaction (reaction: Tables<'comment_reactions'>['reaction_type']) {
        try {
            const response = await addReactionToComment({
                commentId: comment.id,
                reactionType: reaction,
                isReactionPresent
            })

            toast.success('Reaction added successfully')
        } catch (error) {
            console.error(error)
            toast.error('An error occurred while adding reaction. Please try again.')
        }
    }

    const reactionsForEachType = comment_reactions?.reduce((acc, reaction) => {
        acc[reaction.reaction_type] = acc[reaction.reaction_type] + 1 || 1
        return acc
    }, {})

    const replies = allComments.filter(reply => reply.parent_comment_id === comment.id)

    return (
        <Card className="p-2 mb-4">
            <CardHeader className="flex p-2 flex-row items-start gap-4 bg-card">
                <Avatar>
                    <AvatarImage src={avatar} alt="profile" />
                    <AvatarFallback>{name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex justify-between items-center gap-4 w-full">
                    <div>
                        <CardTitle className="text-lg font-medium">{name}</CardTitle>
                        <CardDescription className="text-xs text-gray-400">{date}</CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                        {isAuthor && (
                            <button onClick={toggleEdit} className="text-blue-500 hover:text-blue-700">
                                <Edit3 size={20} />
                            </button>
                        )}
                        <button className="flex items-center gap-1 text-destructive">
                            <Flag className="w-4 h-4" /> Flag
                        </button>
                    </div>
                </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
                <ViewMarkdown markdown={comment.content} />
                {isEditing && isAuthor && (
                    <div className="w-full flex flex-col gap-4">
                        <CommentEditor
                            lesson_id={comment.lesson_id}
                            comment_id={comment.id}
                            course_id={course_id}
                            parent_comment_id={comment.parent_comment_id}
                            callback={() => setIsEditing(false)}
                        />
                        <Button variant="destructive" onClick={() => setIsEditing(false)}>Cancel</Button>
                    </div>
                )}
                {showReplies && (
                    <div className="ml-1 mt-2">
                        <div className="flex flex-col gap-4">
                            <CommentEditor
                                course_id={course_id}
                                lesson_id={comment.lesson_id} parent_comment_id={comment.id} callback={() => { setShowReplies(false) }}
                            />
                            <Button variant="destructive" onClick={toggleReplies}>Cancel</Button>
                        </div>
                    </div>
                )}
            </CardContent>
            <Separator />
            <CardFooter className="flex flex-col gap-4">
                <div className="flex-1 w-full">
                    <div className="flex items-center gap-4 mt-4 justify-between">
                        {reactionsForEachType && reactionTypes?.map(({ type, icon: Icon }) => (
                            <ReactionButton
                                key={type}
                                type={reactionsForEachType[type] ? reactionTypes.find(rt => rt.type === type).color : ''}
                                icon={Icon}
                                count={reactionsForEachType[type] || 0}
                                onClick={async () => await AddReaction(type)}
                            />
                        ))}
                        <button onClick={toggleReplies} className="flex items-center gap-1 text-de">
                            <Reply className="w-4 h-4" /> Reply ({replies.length})
                        </button>
                    </div>
                </div>
                <Accordion className="w-full" type="single" collapsible>
                    <AccordionItem className="border-none w-full" value="reply">
                        <AccordionTrigger>View Replies ({replies.length})</AccordionTrigger>
                        <AccordionContent>
                            <div className="ml-1 mt-2">
                                {replies.map((reply) => {
                                    // Now we correctly find the user profile for replies
                                    const replyUser = profiles.find(profile => profile.id === reply.user_id)
                                    const isReplyAuthor = reply.user_id === currentUser.id

                                    return (
                                        <CommentCard
                                            key={reply.id}
                                            comment={reply}
                                            course_id={course_id}
                                            name={replyUser?.full_name || 'Unknown'}
                                            avatar={replyUser?.avatar_url || '/img/favicon.png'}
                                            date={dayjs(reply?.created_at).format('DD/MM/YYYY: HH:mm')}
                                            isAuthor={isReplyAuthor}
                                            comment_reactions={reply?.comment_reactions}
                                            isReactionPresent={reply?.comment_reactions?.find(
                                                (reaction) => reaction.user_id === currentUser.id
                                            )}
                                            allComments={allComments}
                                            profiles={profiles}
                                            currentUser={currentUser}
                                        />
                                    )
                                })}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardFooter>
        </Card>
    )
}

export default CommentCard
