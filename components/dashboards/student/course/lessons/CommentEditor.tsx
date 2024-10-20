'use client'

import { Loader } from 'lucide-react'
import { useState } from 'react'

import { studentSubmitLessonComment, updateComment } from '@/actions/dashboard/studentActions'
import { useScopedI18n } from '@/app/locales/client'
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
    const t = useScopedI18n('CommentsSections.CommentEditor')

    const submitComment = async () => {
        const payload = comment_id ? { content: commentState, commentId: comment_id } : { comment: commentState, lesson_id, parent_comment_id, course_id }
        const action = comment_id ? updateComment : studentSubmitLessonComment

        try {
            const response = await action(payload as any)

            if (response.status === 'success') {
                setComment('')
            } else if (response.status === 'error') {
                toast({
                    title: t('toast.titleError'),
                    description: response.message || t('toast.descriptionError'),
                    variant: 'destructive'
                })
            }
            callback && callback()
        } catch (error) {
            console.error(error)
            toast({
                title: t('toast.titleError'),
                description: t('toast.descriptionError'),
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
                className="w-full p-3 flex flex-col gap-4 border  rounded-md shadow-sm comment-editor"
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
                    {isLoading ? (
                        <Loader
                            className='animate-spin'
                            size={20}
                        />
                    ) : t('action')}
                </Button>
            </form>
        </>
    )
}
