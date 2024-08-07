'use client'

import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'

import DeleteLessonAlert from '@/components/dashboards/teacher/lessons/DeleteLessonAlert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTableColumnHeader } from '@/components/ui/Table/DataTableColumnHeader'

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
            <DataTableColumnHeader column={column} title="ID" />
        ),
    },
    {
        accessorKey: 'title',
        header: 'Title',
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
        header: 'Description',
    },
    {
        accessorKey: 'sequence',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Sequence" />
        ),
    },
    {
        accessorKey: 'date',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Date" />
        ),
    },
    {
        accessorKey: 'actions',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Actions" />
        ),
        cell: ({ row }) => {
            const rowData = row.original

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>
                            <Button asChild variant="ghost" className="w-full">
                                <Link
                                    href={`/dashboard/teacher/courses/${rowData.courseId}/lessons/${rowData.id}`}
                                >
                                    View details
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
