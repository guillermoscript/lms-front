'use client'

import { useState } from 'react'

import { studentSubmitLessonComment, updateComment } from '@/actions/dashboard/studentActions'
import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import { useToast } from '@/components/ui/use-toast'

export default function CommentEditor ({
    lesson_id,
    parent_comment_id,
    comment_id,
    course_id,
    callback
}: {
    lesson_id: number
    parent_comment_id?: number
    course_id: number
    comment_id?: number
    callback?: () => void
}) {
    const [commentState, setComment] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const submitComment = async () => {
        const payload = comment_id ? { content: commentState, commentId: comment_id } : { comment: commentState, lesson_id, parent_comment_id, course_id }
        const action = comment_id ? updateComment : studentSubmitLessonComment

        try {
            const response = await action(payload as any)

            if (response.status === 'success') {
                setComment('')
            } else if (response.status === 'error') {
                toast({
                    title: 'Error',
                    description: response.message,
                    variant: 'destructive'
                })
            }
            callback && callback()
        } catch (error) {
            console.error(error)
            toast({
                title: 'Error',
                description: 'An error occurred while submitting comment. Please try again.',
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        if (!commentState) {
            return
        }

        setIsLoading(true)
        await submitComment()
    }

    return (
        <>
            <form
                className="w-full p-3 flex flex-col gap-4 border border-gray-200 rounded-md shadow-sm"
                onSubmit={handleFormSubmit}
            >
                <ForwardRefEditor
                    markdown={commentState}
                    className="rich-text"
                    onChange={setComment}
                />

                <Button
                    type="submit"
                    className="disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    disabled={isLoading}
                >
                    {isLoading ? 'Submitting...' : 'Submit Comment'}
                </Button>
            </form>
        </>
    )
}
