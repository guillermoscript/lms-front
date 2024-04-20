type QuestionSectionProps = {
	title: string;
	children: React.ReactNode;
};

export default function QuestionSection({
	title,
	children,
}: QuestionSectionProps) {
	return (
		<div>
			<h2 className="text-2xl font-bold">{title}</h2>
			<div className="space-y-4">{children}</div>
		</div>
	);
}
