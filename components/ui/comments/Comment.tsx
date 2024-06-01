// @ts-nocheck
import { ReplyIcon, ThumbsUpIcon } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

function Comment ({
    username,
    timeAgo,
    commentText,
    isEditable = false
}: {
    username: string
    timeAgo: string
    commentText: string
    isEditable?: boolean
}) {
    return (
        <div className="flex items-start gap-4">
            <Avatar className="w-10 h-10 border">
                <AvatarImage alt={`@${username}`} src="/placeholder-user.jpg" />
                <AvatarFallback>
                    {username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="grid gap-1.5 w-full">
                <div className="flex items-center justify-between">
                    <div className="font-semibold">@{username}</div>
                    <div className="text-gray-500 text-xs dark:text-gray-400">
                        {timeAgo}
                    </div>
                </div>
                {isEditable
                    ? (
                        <>
                            <Textarea
                                className="w-full"
                                placeholder="Write your comment..."
                            />
                            <div className="flex justify-end">
                                <Button size="sm">Post Comment</Button>
                            </div>
                        </>
                    )
                    : (
                        <>
                            <Markdown
                                className={' markdown-body'}
                                remarkPlugins={[remarkGfm]}
                            >
                                {commentText}
                            </Markdown>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="ghost">
                                    <ThumbsUpIcon className="h-4 w-4" />
                                    <span className="sr-only">Like</span>
                                </Button>
                                <Button size="sm" variant="ghost">
                                    <ReplyIcon className="h-4 w-4" />
                                    <span className="sr-only">Reply</span>
                                </Button>
                            </div>
                        </>
                    )}
            </div>
        </div>
    )
}

export default Comment
