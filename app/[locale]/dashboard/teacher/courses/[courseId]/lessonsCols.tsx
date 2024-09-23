'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Eye, MoreHorizontal, View } from 'lucide-react'
import Link from 'next/link'

import ScopedHeader from '@/components/dashboards/Common/table/ScopedHeader'
import DeleteLessonAlert from '@/components/dashboards/teacher/lessons/DeleteLessonAlert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Lessons {
    id: bigint | number
    title: string
    description: string
    sequence: string
    date: string
    actions: React.ReactNode
    courseId: string
}

export const lessonsCols: Array<ColumnDef<Lessons>> = [
    {
        accessorKey: 'id',
        header: ({ column }) => (
            <ScopedHeader scoped="lessonsCols" column={column} word="id" />
        ),
    },
    {
        accessorKey: 'title',
        header: ({ column }) => (
            <ScopedHeader scoped="lessonsCols" column={column} word="title" />
        ),
        cell: ({ row }) => {
            const rowData = row.original

            return (
                <Link
                    className={buttonVariants({ variant: 'link' })}
                    href={`/dashboard/teacher/courses/${rowData.courseId}/lessons/${rowData.id}`}
                >
                    {rowData.title}
                </Link>
            )
        },
    },
    {
        accessorKey: 'description',
        header: ({ column }) => (
            <ScopedHeader
                scoped="lessonsCols"
                column={column}
                word="description"
            />
        ),
    },
    {
        accessorKey: 'sequence',
        header: ({ column }) => (
            <ScopedHeader
                scoped="lessonsCols"
                column={column}
                word="sequence"
            />
        ),
    },
    {
        accessorKey: 'date',
        header: ({ column }) => (
            <ScopedHeader scoped="lessonsCols" column={column} word="date" />
        ),
    },
    {
        accessorKey: 'actions',
        header: ({ column }) => (
            <ScopedHeader scoped="lessonsCols" column={column} word="actions" />
        ),
        cell: ({ row }) => {
            const rowData = row.original

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">
                                <Eye />
                            </span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>
                            <Button asChild variant="ghost" className="w-full">
                                <Link
                                    href={`/dashboard/teacher/courses/${rowData.courseId}/lessons/${rowData.id}`}
                                >
                                    <View className="h-4 w-4" />
                                </Link>
                            </Button>
                        </DropdownMenuLabel>
                        <DropdownMenuLabel>
                            <DeleteLessonAlert
                                lessonId={rowData.id.toString()}
                            />
                        </DropdownMenuLabel>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
