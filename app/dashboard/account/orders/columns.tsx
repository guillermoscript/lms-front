// @ts-nocheck
'use client'

import { ColumnDef } from '@tanstack/react-table'
import { CheckCircleIcon, ClockIcon, MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { DataTableColumnHeader } from '@/components/ui/Table/DataTableColumnHeader'
import { Tables } from '@/utils/supabase/supabase'

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.

export interface TransactionCols {
    id: Tables<'transactions'>
    product_name: string
    plan_id: number
    amount: number
    transaction_date: string
    payment_method: string
    status: string
    currency: string
    actions: React.ReactNode
}

export const orderCols: Array<ColumnDef<TransactionCols>> = [
    {
        accessorKey: 'id',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="ID" />
        )
    },
    {
        accessorKey: 'status',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
            return (
                <div className="flex items-center">
                    {row.original.status === 'successful' ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    ) : row.original.status === 'pending' ? (
                        <ClockIcon className="h-5 w-5 text-yellow-500" />
                    ) : null}
                    <span className="ml-2">{row.original.status}</span>
                </div>
            )
        }
    },
    {
        accessorKey: 'product_name',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Product Name" />
        )
    },
    {
        accessorKey: 'amount',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Amount" />
        )
    },
    {
        accessorKey: 'transaction_date',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Transaction Date" />
        )
    },
    {
        accessorKey: 'payment_method',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Payment Method" />
        )
    },
    {
        accessorKey: 'currency',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Currency" />
        )
    },
    {
        accessorKey: 'actions',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Actions" />
        ),
        cell: ({ row }) => {
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <Button>
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Delete</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>View</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    }
]
