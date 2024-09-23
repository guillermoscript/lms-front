'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Edit, Eye, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'

import ScopedHeader from '@/components/dashboards/Common/table/ScopedHeader'
import DeleteCourseAlert from '@/components/dashboards/teacher/course/DeleteCourseAlert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Course {
    id: number
    title: string
    description: string
    status: string
    date: string
    actions: React.ReactNode
}

export const courseCols: Array<ColumnDef<Course>> = [
    {
        accessorKey: 'id',
        header: ({ column }) => (
            <ScopedHeader scoped='courseCols' column={column} word='id' />
        ),
    },
    {
        accessorKey: 'title',
        header: ({ column }) => (
            <ScopedHeader scoped='courseCols' column={column} word='title' />
        ),
        cell: ({ row }) => {
            const rowData = row.original

            return (
                <Link
                    className={buttonVariants({ variant: 'link' })}
                    href={`/dashboard/teacher/courses/${rowData.id}`}
                >
                    {rowData.title}
                </Link>
            )
        }
    },
    {
        accessorKey: 'description',
        header: ({ column }) => (
            <ScopedHeader scoped='courseCols' column={column} word='description' />
        ),
    },
    {
        accessorKey: 'status',
        header: ({ column }) => (
            <ScopedHeader scoped='courseCols' column={column} word='status' />
        ),
    },
    {
        accessorKey: 'date',
        header: ({ column }) => (
            <ScopedHeader scoped='courseCols' column={column} word='date' />
        ),
    },
    {
        accessorKey: 'actions',
        header: ({ column }) => (
            <ScopedHeader scoped='courseCols' column={column} word='actions' />
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
                                    href={`/dashboard/teacher/courses/${rowData.id}`}
                                >
                                    <Eye className="mr-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </DropdownMenuLabel>
                        <DropdownMenuLabel>
                            <Button asChild variant="ghost" className="w-full">
                                <Link
                                    href={`/dashboard/teacher/courses/${rowData.id}/edit`}
                                >
                                    <Edit className="mr-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </DropdownMenuLabel>
                        <DropdownMenuLabel>
                            <DeleteCourseAlert courseId={rowData.id} />
                        </DropdownMenuLabel>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
