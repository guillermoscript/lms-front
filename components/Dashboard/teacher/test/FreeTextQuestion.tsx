"use client";

import { Control } from "react-hook-form";

import {
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

type Props = {
	questions: { id: string; label: string; placeholder: string }[];

	control: Control;
};

const FreeTextQuestionForm: React.FC<Props> = ({ questions, control }) => (
	<div className="space-y-2 mt-2">
		{questions?.map((question) => (
			<FormField
				key={question.id}
				control={control}
				name={question.id}
				render={({ field }) => (
					<FormItem>
						<FormLabel asChild>
							<Label htmlFor={question.id}>
								{question.label}
							</Label>
						</FormLabel>

						<FormControl>
							<Input
								{...field}
								id={question.id}
								placeholder={question.placeholder}
							/>
						</FormControl>

						<FormMessage />
					</FormItem>
				)}
			/>
		))}
	</div>
);

export function FreeTextQuestionRead({
	questions,
}: {
	questions: { id: string; label: string }[];
}) {
	return (
		<div className="space-y-2 mt-2">
			{questions?.map((question) => (
				<div className="flex flex-col gap-4" key={question.id}>
					<Label>{question.label}</Label>
					<Input />
				</div>
			))}
		</div>
	);
}

export default FreeTextQuestionForm;
