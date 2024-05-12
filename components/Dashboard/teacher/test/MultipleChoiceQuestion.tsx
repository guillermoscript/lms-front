// MultipleChoiceQuestion.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import React from "react";

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
};

const MultipleChoiceQuestion: React.FC<Props> = ({ questions }) => {
	return (
		<div className="space-y-2 mt-2">
			{questions?.map((question) => (
				<div
                    className="space-y-2"
                    key={question.id}>
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
