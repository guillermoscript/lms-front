'use client'
import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'

import { Button, buttonVariants } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTableColumnHeader } from '@/components/ui/Table/DataTableColumnHeader'

interface TestSubmissions {
    submission_id: number
    exam_id: number
    exam_title: string
    student_id: string
    submission_date: string
    score?: any
    feedback?: any
    evaluated_at?: any
    is_reviewed?: boolean
    courseId: string
    full_name: string
}

export const testSubmissionsCols: Array<ColumnDef<TestSubmissions>> = [
    {
        accessorKey: 'submission_id',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="ID" />
        ),
    },
    {
        accessorKey: 'exam_title',
        header: 'Exam Title',
        cell: ({ row }) => {
            const rowData = row.original

            return (
                <Link
                    className={buttonVariants({ variant: 'link' })}
                    href={`/dashboard/teacher/courses/${rowData.courseId}/tests/${rowData.exam_id}/review/${rowData.submission_id}`}
                >
                    {rowData.exam_title}
                </Link>
            )
        },
    },
    {
        accessorKey: 'full_name',
        header: 'Full Name',
    },
    {
        accessorKey: 'submission_date',
        header: 'Submission Date',
    },
    {
        accessorKey: 'score',
        header: 'Score',
    },
    {
        accessorKey: 'feedback',
        header: 'Feedback',
    },
    {
        accessorKey: 'evaluated_at',
        header: 'Evaluated At',
    },
    {
        accessorKey: 'is_reviewed',
        header: 'Is Reviewed',
    },
    {
        accessorKey: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
            const rowData = row.original

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <Button >
                            <MoreHorizontal size={20} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>
                            <Link
                                href={`/dashboard/teacher/courses/${rowData.courseId}/tests/${rowData.exam_id}/review/${rowData.submission_id}`}
                            >
                                View
                            </Link>
                        </DropdownMenuLabel>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
