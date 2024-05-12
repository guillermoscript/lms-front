import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
    FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { courseSchemaType } from "./teacher/course/CreateCourse";
import { Control } from "react-hook-form";

export default function SelectStatus({ control }: { control: Control<courseSchemaType> }) {
	return (
		<FormField
			control={control}
			name="status"
			render={({ field }) => (
				<FormItem>
					<FormLabel>Status</FormLabel>
					<Select
						onValueChange={field.onChange}
						defaultValue={field.value}
					>
						<FormControl>
							<SelectTrigger>
								<SelectValue placeholder="Select status" />
							</SelectTrigger>
						</FormControl>
						<SelectContent>
							<SelectItem value="draft">Draft</SelectItem>
							<SelectItem value="published">Published</SelectItem>
							<SelectItem value="archived">Archived</SelectItem>
						</SelectContent>
					</Select>
					<FormDescription></FormDescription>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}