"use client";

import { Database } from "@/utils/supabase/supabase";
import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/ui/Table/DataTableColumnHeader";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import DeleteLessonAlert from "@/components/dashboard/teacher/lessons/DeleteLessonAlert";

type Lessons = {
	id: bigint | number;
	title: string;
	description: string;
	sequence: string;
	date: string;
	actions: React.ReactNode;
    courseId: string;
};

export const lessonsCols: ColumnDef<Lessons>[] = [
	{
		accessorKey: "id",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="ID" />
		),
	},
	{
		accessorKey: "title",
		header: "Title",
	},
	{
		accessorKey: "description",
		header: "Description",
	},
	{
		accessorKey: "sequence",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Sequence" />
		),
	},
	{
		accessorKey: "date",
		header: "Date",
	},
	{
		accessorKey: "actions",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Acciones" />
		),
		cell: ({ row }) => {
			const rowData = row.original;

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
								href={`/dashboard/teacher/courses/${rowData.courseId}/lessons/${rowData.id}`}
							>
								Ver detalles
							</Link>
						</DropdownMenuLabel>
						<DropdownMenuLabel>
							<DeleteLessonAlert lessonId={rowData.id.toString()} />
						</DropdownMenuLabel>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
