import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@radix-ui/react-select";

import { useState, useCallback, useEffect } from "react";
import { Control } from "react-hook-form";
import {
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormDescription,
	FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { courseSchemaType } from "./teacher/course/CreateCourse";
import { createClient } from "@/utils/supabase/client";

export default function SelectSupabaseField({
	control,
	name,
	table,
	label,
	placeholder,
}: {
	control: Control<courseSchemaType>;
	name: string;
	table: string;
	label: string;
	placeholder: string;
}) {
	const [loading, setLoading] = useState(true);
	const supabase = createClient();
	const [items, setItems] = useState([]);
	const getItems = useCallback(async () => {
		try {
			const { data, error, status } = await supabase
				.from(table)
				.select("id, name");

			if (error && status !== 406) {
				console.log(error);
				throw error;
			}

			if (data) {
				console.log(data);
				setItems(data);
			}
		} catch (error) {
			alert("Error loading user data!");
		} finally {
			setLoading(false);
		}
	}, [supabase, table]);

	useEffect(() => {
		getItems();
	}, [getItems]);

	if (loading) {
		return <Skeleton className="h-10" />;
	}

	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<Select onValueChange={field.onChange}>
						<FormControl>
							<SelectTrigger>
								{field.value ? (
									<SelectValue>
										{
											items.find(
												(item) => item.id == field.value
											)?.name
										}
									</SelectValue>
								) : (
									<SelectValue placeholder={placeholder} />
								)}
							</SelectTrigger>
						</FormControl>
						<SelectContent>
							{items.map((item) => (
								<SelectItem key={item.id} value={item.id}>
									{item.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FormDescription></FormDescription>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
