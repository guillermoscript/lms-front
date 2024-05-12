"use client";
import { createCourseAction } from "@/actions/dashboard/courseActions";
import { Input } from "@/components/form/Form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useFormState } from "react-dom";
import { FormProvider, useForm } from "react-hook-form";
import * as yup from "yup";
import ButtonSubmitDashbaord from "../../ButtonSubmitDashbaord";
import StateMessages from "../../StateMessages";
import SelectStatus from "../../SelectStatus";
import SelectSupabaseField from "../../SelectSupabaseField";
const courseSchema = yup.object().shape({
	title: yup.string().required(),
	description: yup.string().required(),
	status: yup.string().required().oneOf(["draft", "published", "archived"]),
	product_id: yup.number().optional(),
	thumbnail: yup.string().optional(),
	tags: yup.string().optional(),
	category_id: yup.number().optional(),
});

export type courseSchemaType = yup.InferType<typeof courseSchema>;

export default function CreateCourse() {
	const [state, action] = useFormState(createCourseAction, {
		status: "idle",
		message: "",
		error: null,
	});
	const methods = useForm<courseSchemaType>({
		defaultValues: {
			title: "",
			description: "",
		},
		resolver: yupResolver(courseSchema),
		mode: "all",
	});
	return (
		<>
			<h1 className="text-2xl font-semibold">Create a new course</h1>
			<FormProvider {...methods}>
				<form
					action={action}
					className="flex flex-col gap-4 md:min-h-800px"
				>
					<div className="flex items-center gap-3 ">
                    <Input name="title" displayName="Title*" type="text" />
					<Input
						name="description"
						displayName="Description"
						type="textarea"
					/>
                    </div>
					<div className="flex items-center gap-3 ">
                    <Input
						name="thumbnail"
						displayName="Thumbnail"
						type="text"
					/>
					<Input name="tags" displayName="Tags" type="text" />
                    </div>
					

					<SelectSupabaseField control={methods.control} name="product_id" table="products" label="Product ID" placeholder="Select product" />
                    <SelectSupabaseField control={methods.control} name="category_id" table="course_categories" label="Category ID" placeholder="Select category" />

					<SelectStatus control={methods.control} />

					<ButtonSubmitDashbaord />

					<StateMessages state={state} />
				</form>
			</FormProvider>
		</>
	);
}
