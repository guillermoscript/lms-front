"use client";
import Form, { CheckBox, Input } from "./Form";
import FormBuilder, { IFormField } from "./FormBuilder";
import * as yup from "yup";
// Define the initial fields for the test creation form
const initialFields: IFormField[] = [
	{
		type: "checkbox",
		name: "language",
		label: "Language",
		options: [
			{ label: "EN", value: "en" },
			{ label: "ES", value: "es" },
			// Add more language options as needed
		],
		required: true,
	},
	{
		type: "text",
		name: "testName",
		label: "Test Name",
		required: true,
	},
	{
		type: "text",
		name: "testDescription",
		label: "Test Description",
		required: true,
	},
	{
		type: "number",
		name: "course",
		label: "The Course the Test Belongs To",
		required: true,
	},
	{
		type: "text",
		name: "retakeInterval",
		label: "Retake Interval",
		required: true,
	},
	{
		type: "number",
		name: "timeForTest",
		label: "Time for Test (minutes)",
		required: true,
	},
];


const teacherTestForm = yup.object().shape({
	language: yup.string().required("Language is required"),
	testName: yup.string().required("Test Name is required"),
	testDescription: yup.string().required("Test Description is required"),
	course: yup.string().required("Course is required"),
	retakeInterval: yup.string().required("Retake Interval is required"),
	timeForTest: yup.string().required("Time for Test is required"),
});

type teacherTestFormType = yup.InferType<typeof teacherTestForm>;

const classNames = {
	label: "text-xs font-medium text-neutral-600",
	input: "input input-bordered w-full",
	error: "pt-2 text-red-400",
	container: "mb-4 flex flex-col gap-4",
};


const TeacherTestForm: React.FC = () => {
	function onSubmit(data: any) {
		console.log(data);
	}

	return (
		<div className="container mx-auto p-4">
			<h1 className="text-2xl font-bold mb-4">Create Test Content</h1>
			<Form
				defaultValues={{
					language: "",
					testName: "",
					testDescription: "",
					course: "",
					retakeInterval: "",
					timeForTest: "",
				}}
				onSubmit={onSubmit}
				schema={teacherTestForm}
				className="flex flex-col gap-3"
			>
				<CheckBox
					name="language"
					text="Language"
					clasess={classNames}
				/>
				<Input
					name="testName"
					displayName="Test Name"
					type="text"
					clasess={classNames}
				/>
				<Input
					name="testDescription"
					displayName="Test Description"
					type="text"
					clasess={classNames}
				/>
				<Input
					name="course"
					displayName="Course"
					type="number"
					clasess={classNames}
				/>
				<Input
					name="retakeInterval"
					displayName="Retake Interval"
					type="text"
					clasess={classNames}
				/>
				<Input
					name="timeForTest"
					displayName="Time for Test"
					type="number"
					clasess={classNames}
				/>

				<FormBuilder initialFields={initialFields} />
			</Form>
		</div>
	);
};

export default TeacherTestForm;
