// @ts-nocheck
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "@/components/ui/Table/DataTableColumnHeader";
import { Database, Tables } from "@/utils/supabase/supabase";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.

export interface Order {
  id: Tables<"transactions">;
  // amount: number;
  currencies: Database["public"]["Tables"]["currencies"]["Row"]["code"];
  status: Tables<"transactions">;
  created_at: Tables<"transactions">;
  paid_at: Tables<"transactions">;
  due_date: Tables<"transactions">;
  actions: string | JSX.Element;
}

export const orderCols: Array<ColumnDef<Order>> = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
  },
  {
    accessorKey: "paid_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Paid At" />
    ),
  },
  {
    accessorKey: "due_date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Due Date" />
    ),
  },
  {
    accessorKey: "currencies.code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Currency" />
    ),
  },
  // {
  //   accessorKey: "amount",
  //   header: "Amount",
  // },
  {
    id: "actions",
    cell: ({ row }) => {
      const payment = row.original;
      console.log(row);

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {/* <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(payment.id)
              }
            >
              Copy payment ID
            </DropdownMenuItem> */}
            <DropdownMenuSeparator />
            <DropdownMenuItem>View customer</DropdownMenuItem>
            <DropdownMenuItem>View payment details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
