"use client";
// FreeTextQuestion.tsx
import {
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormDescription,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Control } from "react-hook-form";

type Props = {
	questions: { id: string; label: string; placeholder: string }[];
	control: Control
};

const FreeTextQuestionForm: React.FC<Props> = ({ questions, control }) => (
	<div className="space-y-2 mt-2">
		{questions?.map((question) => (
			<div key={question.id}>
				<FormField
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
									id={question.id}
									placeholder={question.placeholder}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		))}
	</div>
);

export function FreeTextQuestionRead({ questions }: {
	questions: { id: string; label: string }[];
}) { 
	return (
		<div className="space-y-2 mt-2">
			{questions?.map((question) => (
				<div key={question.id}>
					<Label>{question.label}</Label>
					<Input disabled />
				</div>
			))}
		</div>
	);
}

export default FreeTextQuestionForm
