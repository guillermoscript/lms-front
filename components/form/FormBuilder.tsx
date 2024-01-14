"use client";
import { useState } from "react";
import {
	useForm,
	useFieldArray,
	SubmitHandler,
	FieldValues,
	useFormContext,
} from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import InputField from "./InputField";
import { Separator } from "../ui/separator";
export interface IFormField {
	id?: string;
	type:
		| "text"
		| "checkbox"
		| "radio"
		| "select"
		| "number"
		| "textarea"
		| "markdown"
		| "date"
		| "array"
		| "fill_in"
		| "multiple_choices"
		| "true_false";
	name: string;
	label: string;
	options?: IOption[];
	required: boolean;
	value?: any; // This will store the actual value for the field
}

interface IOption {
	label: string;
	value: string;
	correct?: boolean; // This indicates if the option is a correct answer
}

interface IFormInput {
	formFields: IFormField[];
}

// Define a validation schema using Yup
// const schema = yup
// 	.object({
// 		formFields: yup.array().of(
// 			yup.object({
// 				label: yup.string().required("Label is required"),
// 				value: yup.mixed().when("type", {
// 					is: (value) => ["select", "radio", "checkbox"].includes(value),
// 					then: yup.string().required("Text is required"),
// 					otherwise: yup.string(),
// 				}),
// 				// Add more validations based on the type if needed
// 			})
// 		),
// 	})
// 	.required();

interface FormBuilderProps {
	initialFields: IFormField[];
}

const FormBuilder: React.FC<FormBuilderProps> = ({ initialFields }) => {
	const {
		register,
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useFormContext<IFormInput>();
	const { fields, append, remove } = useFieldArray({
		control,
		name: "formFields",
	});
	const [inputType, setInputType] = useState<string>("fill_in");
	const onSubmit: SubmitHandler<IFormInput> = (data) => {
		console.log(data);
	};

	const addField = () => {
		append({ type: inputType, label: "", options: [], required: false });
	};

	return (
		<div
			onSubmit={handleSubmit(onSubmit)}
			className="space-y-4 flex flex-col gap-4"
		>
			{fields.map((field, index) => (
				<InputField
					key={field.id}
					field={field}
					index={index}
					register={register}
					control={control}
					remove={remove}
				/>
			))}

			<Separator />

			<select
				value={inputType}
				onChange={(e) => setInputType(e.target.value)}
				className="block w-full p-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
			>
				{/* <option value="text">Text</option>
				<option value="select">Select</option>
				<option value="checkbox">Checkbox</option>
				<option value="radio">Radio</option>
				<option value="number">Number</option>
				<option value="textarea">Textarea</option>
				<option value="markdown">Markdown</option>
				<option value="date">Date</option> */}
				<option value="fill_in">Fill In</option>
				<option value="multiple_choices">Multiple Choices</option>
				<option value="true_false">True/False</option>
			</select>

			<Separator />

			<button
				type="button"
				onClick={addField}
				className="px-4 py-2 bg-blue-500 text-white rounded-md"
			>
				Add Field
			</button>

			<button
				type="submit"
				className="px-4 py-2 bg-green-500 text-white rounded-md"
			>
				Submit Form
			</button>
		</div>
	);
};

export default FormBuilder;
