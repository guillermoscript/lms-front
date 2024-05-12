"use client";
import { Input, Select } from "@/components/form/Form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm, FormProvider } from "react-hook-form";
import ButtonSubmitDashbaord from "../../ButtonSubmitDashbaord";
import {
	createLessonsAction,
	editLessonsAction,
} from "@/actions/dashboard/lessonsAction";
import * as yup from "yup";
import { useFormState } from "react-dom";
import StateMessages from "../../StateMessages";
import { ForwardRefEditor } from "@/components/ui/markdown/ForwardRefEditor";
import { Textarea } from "@/components/ui/textarea";

const selectClassNames = {
	container: "  flex flex-col form-control gap-3 relative",
	label: "text-sm  font-medium text-neutral-600",
	input: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
	error: "pt-2 text-destructive absolute top-full left-0 text-xs",
};

// Schema for form validation
const lessonSchema = yup.object({
	title: yup.string().required("Title is required"),
	description: yup.string().required("Description is required"),
	sequence: yup
		.number()
		.required("Sequence is required")
		.positive()
		.integer(),
	video_url: yup.string().url().nullable(),
	embed: yup.string().nullable(),
	content: yup.string().required("Content is required"),
	status: yup.string().oneOf(["draft", "published", "archived"]).required(),
	language: yup.string().required("Language is required"),
});

export type LessonSchemaType = yup.InferType<typeof lessonSchema>;

interface LessonFormProps {
	params: { courseId: string; lessonId?: string };
	initialValues?: Partial<LessonSchemaType>;
}

const LessonForm: React.FC<LessonFormProps> = ({ params, initialValues }) => {
	const { courseId, lessonId } = params;
	const isEditing = !!lessonId;
	const [state, action] = useFormState(
		isEditing ? editLessonsAction : createLessonsAction,
		{
			status: "idle",
			message: "",
			error: null,
		}
	);
	const defaultValues: LessonSchemaType = {
		title: "",
		description: "",
		sequence: 0,
		video_url: "",
		embed: "",
		content: "",
		status: "draft",
		language: "en",
		...initialValues,
	};

	const formMethods = useForm<LessonSchemaType>({
		resolver: yupResolver(lessonSchema),
		defaultValues,
	});

	const contentWatch = formMethods.watch("content");

	return (
		<FormProvider {...formMethods}>
			<form action={action} className="space-y-4">
				<h1 className="text-2xl font-semibold">
					{isEditing ? "Edit" : "Create"} Lesson
				</h1>
				<Input type="text" name="title" displayName="Title" />
				<div className="flex flex-col gap-4 md:min-h-800px">
					<label htmlFor="description">Description</label>
					<Textarea id="description" name="description" />
				</div>
				<Input name="sequence" displayName="Sequence" type="number" />
				<Input
					type="text"
					name="video_url"
					displayName="YouTube Video URL"
				/>
				<Input type="text" name="embed" displayName="Embed Code" />
				<Select
					name="status"
					displayName="Status"
					options={[
						{ value: "draft", label: "Draft" },
						{ value: "published", label: "Published" },
						{ value: "archived", label: "Archived" },
					]}
					clasess={selectClassNames}
				/>

				<Select
					name="language"
					displayName="Language"
					options={[
						{ value: "en", label: "English" },
						{ value: "es", label: "Spanish" },
						{ value: "fr", label: "French" },
					]}
					clasess={selectClassNames}
				/>

				<ForwardRefEditor
					markdown={contentWatch}
					className="markdown-body"
					onChange={(value) => formMethods.setValue("content", value)}
				/>
				<input type="hidden" name="content" value={contentWatch} />
				<input type="hidden" name="course_id" value={courseId} />
				<input type="hidden" name="lessonId" value={lessonId} />
				<ButtonSubmitDashbaord />
				<StateMessages state={state} />
			</form>
		</FormProvider>
	);
};

export default LessonForm;
