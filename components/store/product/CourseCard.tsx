import { Card, CardContent } from "@/components/ui/card";
import ImageContainer from "./ImageContainer";

interface CourseCardProps {
	courseImage: string;
	courseName: string;
	lessonsCount: string;
	description: string;
}

const CourseCard: React.FC<CourseCardProps> = ({
	courseImage,
	courseName,
	lessonsCount,
	description,
}) => (
	<Card>
		<CardContent className="space-y-4">
			<div className="flex items-center gap-3">
				<ImageContainer
					src={courseImage}
					alt={`${courseName} image`}
					height={64}
					width={64}
				/>
				<div>
					<div className="font-medium">{courseName}</div>
					<div className="text-gray-500 dark:text-gray-400 text-sm">
						{lessonsCount}
					</div>
				</div>
			</div>
			<p className="text-lg font-medium">{description}</p>
		</CardContent>
	</Card>
);

export default CourseCard;