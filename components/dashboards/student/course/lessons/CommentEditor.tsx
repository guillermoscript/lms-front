'use client'

import { useState } from 'react'

import { studentSubmitLessonComment } from '@/actions/dashboard/studentActions'
import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import { useToast } from '@/components/ui/use-toast'

export default function CommentEditor ({
    lesson_id,
    parent_comment_id
}: {
    lesson_id: number
    parent_comment_id?: number
}) {
    const [commentState, setComment] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        if (!commentState) {
            return
        }

        setIsLoading(true)
        try {
            const response = await studentSubmitLessonComment({
                comment: commentState,
                lesson_id,
                parent_comment_id
            })

            if (response.status === 'success') {
                setComment('')
            } else if (response.status === 'error') {
                toast({
                    title: 'Error',
                    description: response.message,
                    variant: 'destructive'
                })
            }
        } catch (error) {
            console.log(error)
            toast({
                title: 'Error',
                description:
					'An error occurred while submitting comment. Please try again.',
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            <form
                className="w-full p-3 flex flex-col gap-4"
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
