'use client'
import { ColumnDef } from '@tanstack/react-table'

import ConvertCourseToProduct from '@/components/dashboards/admin/course/ConvertCourseToProduct'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
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
                <>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button>Link product</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>
                                    Link product to course
                                </DialogTitle>
                            </DialogHeader>
                            <ConvertCourseToProduct rowData={rowData} />
                        </DialogContent>
                    </Dialog>
                </>
            )
        },
    },
]
