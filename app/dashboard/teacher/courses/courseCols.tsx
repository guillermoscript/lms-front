'use client'

import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'

import DeleteCourseAlert from '@/components/dashboards/teacher/course/DeleteCourseAlert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTableColumnHeader } from '@/components/ui/Table/DataTableColumnHeader'

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
                    href={`/dashboard/teacher/courses/${rowData.id}`}
                >
                    {rowData.title}
                </Link>
            )
        }
    },
    {
        accessorKey: 'description',
        header: 'Description',
    },
    {
        accessorKey: 'status',
        header: 'Status',
    },
    {
        accessorKey: 'date',
        header: 'Date',
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
                                    href={`/dashboard/teacher/courses/${rowData.id}`}
                                >
                                    View course
                                </Link>
                            </Button>
                        </DropdownMenuLabel>
                        <DropdownMenuLabel>
                            <Button asChild variant="ghost" className="w-full">
                                <Link
                                    href={`/dashboard/teacher/courses/${rowData.id}/edit`}
                                >
                                    Edit course
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
