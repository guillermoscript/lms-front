'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { Tables } from '@/utils/supabase/supabase'

export default function NotificationSidebarFilter () {
    const form = useForm()

    const onSubmit = (data: any) => {
        console.log(data)
    }

    const allWatch = form.watch('all')
    const commentsWatch = form.watch('comments')
    const examReviewWatch = form.watch('exam_review')
    const orderRenewalWatch = form.watch('order_renewal')
    const commentReplyWatch = form.watch('comment_reply')
    const router = useRouter()

    const [
        commentFilter,
        commentReplyFilter,
        examReviewFilter,
        orderRenewalFilter
    ]: Array<Tables<'notifications'>['notification_type']> = [
        'comment',
        'comment_reply',
        'exam_review',
        'order_renewal'
    ]

    useEffect(() => {
        if (allWatch) {
            form.setValue('comments', true)
            form.setValue('exam_review', true)
            form.setValue('order_renewal', true)
            form.setValue('comment_reply', true)
            router.push('/dashboard/notifications?filter=all')
        } else {
            form.setValue('comments', false)
            form.setValue('exam_review', false)
            form.setValue('order_renewal', false)
            form.setValue('comment_reply', false)
            router.push('/dashboard/notifications')
        }
    }, [allWatch])

    useEffect(() => {
        if (commentsWatch) {
            router.push(`/dashboard/notifications?filter=${commentFilter}`)
        } else {
            router.push('/dashboard/notifications')
        }
    }, [commentsWatch])

    useEffect(() => {
        if (examReviewWatch) {
            router.push(`/dashboard/notifications?filter=${examReviewFilter}`)
        } else {
            router.push('/dashboard/notifications')
        }
    }, [examReviewWatch])

    useEffect(() => {
        if (orderRenewalWatch) {
            router.push(`/dashboard/notifications?filter=${orderRenewalFilter}`)
        } else {
            router.push('/dashboard/notifications')
        }
    }, [orderRenewalWatch])

    useEffect(() => {
        if (commentReplyWatch) {
            router.push(`/dashboard/notifications?filter=${commentReplyFilter}`)
        } else {
            router.push('/dashboard/notifications')
        }
    }, [commentReplyWatch])

    return (
        <form
            className="flex flex-col space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
        >
            <ul>
                <li className="mb-2">
                    <input
                        {...form.register('all')}
                        type="checkbox" id="all" name="all" className="mr-2"
                    />
                    <label htmlFor="all" className="text-gray-800 dark:text-gray-200">
                    All
                    </label>
                </li>
                <li className="mb-2">
                    <input
                        {...form.register('comments')}
                        type="checkbox"
                        id="comments"
                        name="comments"
                        className="mr-2"
                    />
                    <label
                        htmlFor="comments"
                        className="text-gray-800 dark:text-gray-200"
                    >
                    Comments
                    </label>
                </li>
                <li className="mb-2">
                    <input
                        {...form.register('comment_reply')}
                        type="checkbox"
                        id="comment_reply"
                        name="comment_reply"
                        className="mr-2"
                    />
                    <label
                        htmlFor="comment_reply"
                        className="text-gray-800 dark:text-gray-200"
                    >
                    Comment Reply
                    </label>
                </li>
                <li className="mb-2">
                    <input
                        {...form.register('exam_review')}
                        type="checkbox"
                        id="exam_review"
                        name="exam_review"
                        className="mr-2"
                    />
                    <label
                        htmlFor="exam_review"
                        className="text-gray-800 dark:text-gray-200"
                    >
                    Exam Review
                    </label>
                </li>
                <li className="mb-2">
                    <input
                        {...form.register('order_renewal')}
                        type="checkbox"
                        id="order_renewal"
                        name="order_renewal"
                        className="mr-2"
                    />
                    <label
                        htmlFor="order_renewal"
                        className="text-gray-800 dark:text-gray-200"
                    >
                    Order Renewal
                    </label>
                </li>
            </ul>
        </form>
    )
}
