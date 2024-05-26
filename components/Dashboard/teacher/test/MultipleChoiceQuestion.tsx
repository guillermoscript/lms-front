"use client";
import { FormField } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import React from "react";
import { Checkbox } from "@/components/ui/checkbox";

type Option = {
	id: string;

	text: string;
};

type Question = {
	id: string;

	label: string;

	options: Option[];
};

type Props = {
	questions: Question[];

	form: any;
};

const MultipleChoiceQuestion: React.FC<Props> = ({ questions, form }) => {
	return (
		<div className="space-y-2 mt-2">
			{questions?.map((question) => (
				<div className="space-y-2" key={question.id}>
					<Label htmlFor={question.id}>{question.label}</Label>

					{question.options.map((option) => (
						<FormField
							key={option.id}
							control={form.control}
							name={`${question.id}`}
							render={({ field }) => {
								return (
									<div className="flex items-center gap-2">
										<Checkbox
											checked={field.value.includes(
												option.id
											)}
											onCheckedChange={(checked) => {
												let newValue =
													form.getValues(
														`${question.id}`
													) || [];
	
												if (checked) {
													newValue.push(option.id);
												} else {
													newValue = newValue.filter(
														(val: any) => val !== option.id
													);
												}
	
												form.setValue(
													`${question.id}`,
													newValue
												);
											}}
										/>
	
										<Label>{option.text}</Label>
									</div>
								)
							}}
						/>
					))}
				</div>
			))}
		</div>
	);
};

export const MultipleChoiceQuestionRead: React.FC<Props> = ({ questions }) => {
	return (
		<div className="space-y-2 mt-2">
			{questions?.map((question) => (
				<div className="space-y-2" key={question.id}>
					<Label htmlFor={question.id}>{question.label}</Label>
					{question.options.map((option) => (
						<div
							key={option.id}
							className="flex items-center gap-2"
						>
							<Checkbox id={question.id} defaultChecked={false} />

							<Label>{option.text}</Label>
						</div>
					))}
				</div>
			))}
		</div>
	);
};

export default MultipleChoiceQuestion;
