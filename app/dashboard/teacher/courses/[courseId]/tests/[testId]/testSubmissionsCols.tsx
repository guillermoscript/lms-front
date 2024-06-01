'use client'
import { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '@/components/ui/Table/DataTableColumnHeader'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'

interface TestSubmissions {
  id: bigint | number
  date: string
  actions: React.ReactNode
  testId: bigint | number
  courseId: string
}

export const testSubmissionsCols: Array<ColumnDef<TestSubmissions>> = [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    )
  },
  {
    accessorKey: 'date',
    header: 'Date'
  },
  {
    accessorKey: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Acciones" />
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
              <Link
                href={`/dashboard/teacher/courses/${rowData.courseId}/tests/${rowData.testId}/review/${rowData.id}`}
              >
                Ver detalles
              </Link>
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  }
]
