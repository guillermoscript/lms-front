'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Eye, MoreHorizontal, View } from 'lucide-react'
import Link from 'next/link'

import ScopedHeader from '@/components/dashboards/Common/table/ScopedHeader'
import DeleteExerciseAlert from '@/components/dashboards/teacher/exercises/DeleteExerciseAlert'
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
    lesson_id: string
    created_by: string
    exercise_type: string
    difficulty_level: string
    courseId: string
    created_at: string
}

export const exerciseCols: Array<ColumnDef<Lessons>> = [
    {
        accessorKey: 'id',
        header: ({ column }) => (
            <ScopedHeader scoped="exerciseCols" column={column} word="id" />
        ),
    },
    {
        accessorKey: 'title',
        header: ({ column }) => (
            <ScopedHeader scoped="exerciseCols" column={column} word="title" />
        ),
        cell: ({ row }) => {
            const rowData = row.original

            return (
                <Link
                    className={buttonVariants({ variant: 'link' })}
                    href={`/dashboard/teacher/courses/${rowData.courseId}/exercises/${rowData.id}`}
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
                scoped="exerciseCols"
                column={column}
                word="description"
            />
        ),
    },
    {
        accessorKey: 'created_at',
        header: ({ column }) => (
            <ScopedHeader
                scoped="exerciseCols"
                column={column}
                word="created_at"
            />
        )
    },
    {
        accessorKey: 'created_by',
        header: ({ column }) => (
            <ScopedHeader
                scoped="exerciseCols"
                column={column}
                word="created_by"
            />
        )
    },
    {
        accessorKey: 'exercise_type',
        header: ({ column }) => (
            <ScopedHeader
                scoped="exerciseCols"
                column={column}
                word="exercise_type"
            />
        )
    },
    {
        accessorKey: 'difficulty_level',
        header: ({ column }) => (
            <ScopedHeader
                scoped="exerciseCols"
                column={column}
                word="difficulty_level"
            />
        )
    },
    {
        accessorKey: 'actions',
        header: ({ column }) => (
            <ScopedHeader scoped="exerciseCols" column={column} word="actions" />
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
                                    href={`/dashboard/teacher/courses/${rowData.courseId}/exercises/${rowData.id}`}
                                >
                                    <View className="h-4 w-4" />
                                </Link>
                            </Button>
                        </DropdownMenuLabel>
                        <DropdownMenuLabel>
                            <DeleteExerciseAlert
                                exerciseId={rowData.id.toString()}
                            />
                        </DropdownMenuLabel>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
