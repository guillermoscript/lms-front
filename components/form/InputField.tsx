"use client";

import React, { useState } from "react";
import { FieldValues, useFieldArray } from "react-hook-form";
import { IFormField } from "./FormBuilder";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const inputClass =
	"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const InputField: React.FC<{
	field: IFormField;
	index: number;
	register: any;
	control: any;
	remove: any;
	errors: FieldValues;
}> = ({ field, index, register, control, remove, errors }) => {
	const { fields: optionFields, append: appendOption } = useFieldArray({
		control,
		name: `formFields[${index}].options`,
	});

	switch (field.type) {
		case "text":
		case "number":
		case "date":
			return (
				<Card>
					<CardHeader>
						<CardTitle>{field.label}</CardTitle>
						<CardDescription>Card Description</CardDescription>
					</CardHeader>
					<CardContent>
						<input
							{...register(`formFields[${index}].value`)}
							type={field.type}
							placeholder={`Enter ${field.type}`}
							className={inputClass}
						/>
					</CardContent>
					<CardFooter>
						{errors?.formFields && errors.formFields[index] && (
							<p className="text-red-500 text-xs italic">
								{errors.formFields[index].value.message}
							</p>
						)}
					</CardFooter>
				</Card>
			);
		case "textarea":
		case "markdown":
			return (
				<>
					<Card>
						<CardHeader>
							<CardTitle>{field.label}</CardTitle>
						</CardHeader>
						<CardContent>
							<textarea
								{...register(`formFields[${index}].value`)}
								placeholder={`Enter ${field.type}`}
								className="block w-full p-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
							/>
						</CardContent>
						<CardFooter>
							{errors.formFields && errors.formFields[index] && (
								<p className="text-red-500 text-xs italic">
									{errors.formFields[index].value.message}
								</p>
							)}
						</CardFooter>
					</Card>
				</>
			);
		case "select":
		case "radio":
		case "checkbox":
			return (
				<>
					<Card>
						<CardHeader>
							<CardTitle>{field.label}</CardTitle>
						</CardHeader>
						<CardContent>
							{field?.options?.map((option, optionIndex) => (
								<div
									className="flex gap-2 items-center"
									key={option.id}>
									{option.label && (
										<label>{option.label}</label>
									)}
									<input
										{...register(
											`formFields[${index}].options[${optionIndex}].value`
										)}
										type={
											field.type === "select"
												? "text"
												: field.type
										}
										placeholder={`Enter ${field.type} option`}
										className="block p-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
									/>
								</div>
							))}
						</CardContent>
						{/* <CardFooter>
							{errors.formFields && errors.formFields[index] && (
								<p className="text-red-500 text-xs italic">
									{errors.formFields[index].value.message}
								</p>
							)}
						</CardFooter> */}
					</Card>
				</>
			);
		case "array":
			return (
				<div>
					{field.value.map((subField, subIndex) => (
						<InputField
							key={subField.id}
							field={subField}
							index={subIndex}
							register={register}
							control={control}
							remove={() => remove(subIndex)}
							errors={errors}
						/>
					))}
					<button
						type="button"
						// onClick={() =>
						// 	// appendOption(

						// 	// )
						// }
					>
						Add Question
					</button>
				</div>
			);
		case "multiple_choices":
			return (
				<MultipleChoises
					optionFields={optionFields}
					appendOption={appendOption}
					register={register}
					remove={remove}
					index={index}
				/>
			);
		case "true_false":
			return (
				<TrueFalse
					optionFields={optionFields}
					appendOption={appendOption}
					register={register}
					remove={remove}
					index={index}
				/>
			);
		case "fill_in":
			return (
				<Card key={field.id}>
					<CardHeader>
						<CardTitle>
							Question #{index} - Fill in the blank question
						</CardTitle>
						<CardDescription>Question text</CardDescription>
					</CardHeader>
					<CardContent>
						<input
							{...register(`formFields[${index}].label`)}
							type="text"
							placeholder="Enter question text"
							className={inputClass}
							
						/>
					</CardContent>
					<CardFooter>
						<Button
							variant={"destructive"}
							onClick={() => remove(index)}
						>
							Remove Question
						</Button>
					</CardFooter>
				</Card>
			);

		default:
			return null;
	}
};

export default InputField;

function TrueFalse({
	optionFields,
	appendOption,
	register,
	remove,
	index,
}: {
	optionFields: any;
	appendOption: any;
	register: any;
	remove: any;
	index: number;
}) {

	const [isTrue, setIsTrue] = useState<boolean>(false);
	const [inputText, setInputText] = useState<string>("");

	return (
		<Card key={index}>
			<CardHeader>
				<CardTitle>
					<label
						htmlFor="questionText"
						className="block text-sm font-medium text-gray-700"
					>
						Question text
					</label>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<input
					{...register(`formFields[${index}].label`)}
					type="text"
					placeholder="Enter question text"
					className={inputClass}
					
				/>

				<div className="flex flex-row gap-2 items-center">
					<label>
						Is True? (Check if true, uncheck if false) question #
						{index}
					</label>
					<input
						{...register(`formFields[${index}].value`)}
						type="checkbox"
						
					/>
				</div>
			</CardContent>
			<CardFooter>
				<Button variant={"destructive"} onClick={() => remove(index)}>
					Remove Question
				</Button>
			</CardFooter>
		</Card>
	);
}

function MultipleChoises({
	optionFields,
	appendOption,
	register,
	remove,
	index,
}: {
	optionFields: any;
	appendOption: any;
	register: any;
	index: number;
	remove: any;
}) {
	const [inputType, setInputType] = useState<string>("");
	const [isCorrect, setIsCorrect] = useState<boolean>(false);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Question #{index}</CardTitle>
					<CardDescription>
						<div className="flex flex-col items-start gap-2">
							<div className="flex flex-col gap-2">
								<p>Add question text</p>
								<input
									className={inputClass}
									value={inputType}
									onChange={(e) =>
										setInputType(e.target.value)
									}
									type="text"
								/>
							</div>
							{/* ... handle errors */}
							<Button
								type="button"
								onClick={() => {
									appendOption({
										label: inputType,
										value: isCorrect,
										correct: isCorrect,
									});
									setInputType("");
									setIsCorrect(false);
								}}
							>
								Add Option
							</Button>
						</div>
					</CardDescription>
				</CardHeader>
				<CardContent>
					{optionFields.map((optionField, optionIndex) => {
						console.log(optionField);
						return (
							<div
								className="flex flex-col gap-2 items-start"
								key={optionField.id}
							>
								<input
									{...register(
										`formFields[${index}].options[${optionIndex}].label`
									)}
									type="text"
									placeholder={`Enter option ${
										optionIndex + 1
									}`}
									className={inputClass}
								/>
								<div className="flex flex-row gap-2">
									<label>Is correct?</label>
									<input
										{...register(
											`formFields[${index}].options[${optionIndex}].value`
										)}
										type="checkbox"
										
									/>
								</div>
								{/* ... handle errors */}
							</div>
						);
					})}
				</CardContent>
				<CardFooter>
					<Button
						variant={"destructive"}
						type="button"
						onClick={() => remove(index)}
					>
						Remove Option
					</Button>
				</CardFooter>
			</Card>
		</>
	);
}
