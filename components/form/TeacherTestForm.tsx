"use client";
import Form, { CheckBox, Input } from "./Form";
import FormBuilder, { IFormField } from "./FormBuilder";
import * as yup from "yup";
import { Button } from "../ui/button";
import { useToast } from "../ui/use-toast";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { FormProvider, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";
import axios from "axios";
import TestQuestions from "../dashboard/teacher/test/TestQuestions";


const classNames = {
	label: "text-xs font-medium text-neutral-600",
	input: "input input-bordered w-full",
	error: "pt-2 text-red-400",
	container: "mb-4 flex flex-col gap-4",
};

const validationSchema = yup.object().shape({
	language: yup.array().of(yup.string()).required("Language is required"),
	testName: yup.string().required("Test Name is required"),
	testDescription: yup.string().required("Test Description is required"),
	course: yup.number().required("Course is required"),
	retakeInterval: yup.string().required("Retake Interval is required"),
	timeForTest: yup.number().required("Time for Test is required"),
	questions: yup.mixed().required("Questions are required"),

});

type TestFormType = yup.InferType<typeof validationSchema>;

interface TestFormProps {
	defaultValues?: Partial<TestFormType>;
	testId?: string; // Optional: if provided, it's an edit form
}

const TeacherTestForm: React.FC<TestFormProps> = ({
	defaultValues = {},
	testId,
}) => {
	
	const isEditing = !!testId;

	const initialValues: TestFormType = {
		language: [],
		testName: "",
		testDescription: "",
		course: 0,
		retakeInterval: "",
		timeForTest: 0,
		questions: [],
		...defaultValues,
	};

	const formMethods = useForm<TestFormType>({
		resolver: yupResolver(validationSchema),
		defaultValues: initialValues,
	});


	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const {toast} = useToast();

	const handleSubmit = async (data: TestFormType) => {
		setIsLoading(true);

		const url = testId ? `/api/test/${testId}` : `/api/test`;
		const method = testId ? "put" : "post";

		try {
			const response = await axios[method](url, data);
			const message = testId ? "Test Updated" : "Test Created";
			toast({ title: message });
		} catch (error) {
			console.error("Error submitting the form", error);
			toast({
				title: "Error",
				description: "Failed to submit the form",
				variant: 'destructive'
			});
		} finally {
			setIsLoading(false);
		}
	};



	return (
		<div className="container mx-auto p-4">
			<h1 className="text-2xl font-bold mb-4">
				{testId ? "Edit Test Content" : "Create Test Content"}
			</h1>
			<FormProvider {...formMethods}>
				<form
					onSubmit={formMethods.handleSubmit(handleSubmit)}
					className="space-y-4"
				>
					<CheckBox
						name="language"
						text="Language"
						options={[
							{ label: "EN", value: "en" },
							{ label: "ES", value: "es" },
							// Add more language options as needed
						]}
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
					{/* <TestQuestions
						test_questions={defaultValues.questions}
					/> */}
					<Card>
						<CardHeader>
							<CardTitle>Test Questions</CardTitle>
							<CardDescription>
								Here you can add questions to the test
							</CardDescription>
						</CardHeader>
						<CardContent>
							<FormBuilder initialFields={[]}>
								<Button type="submit" disabled={isLoading}>
									{isEditing ? "Update Test" : "Create Test"}
								</Button>
							</FormBuilder>
						</CardContent>
					</Card>
				</form>
			</FormProvider>

			{error && (
				<div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center">
					<div className="bg-white p-4 rounded shadow-lg">
						{error}
					</div>
				</div>
			)}
		</div>
	);
};

export default TeacherTestForm;
