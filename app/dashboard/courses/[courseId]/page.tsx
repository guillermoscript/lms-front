import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { BookIcon, ClipboardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area"

export default async function Dashboard({
	params,
}: {
	params: { courseId: string };
}) {
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const course = await supabase
		.from(`courses`)
		.select("*,  lessons ( *, lesson_localizations ( * ) ), tests ( *, test_localizations ( * ) )")
		.eq("id", params.courseId)
		.single();


	const lessonProgress = await supabase
		.rpc("get_course_progress", {
			course_id_arg: Number(course.data?.id),
			user_id_arg: user?.id as string,
		})
		.single();

	return (
		<div className="grid grid-cols-1 gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Course Progress</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-between flex-wrap">
					<div className="flex items-center gap-4 flex-wrap justify-around w-full">
						<ProgressCard
							value={`${lessonProgress?.data?.progress_percentage}%`}
							label="Total Progress"
						/>
						<ProgressCard
							value={lessonProgress?.data?.total_lessons}
							label="Total Lessons"
						/>
						<ProgressCard
							value={lessonProgress.data?.completed_lessons}
							label="Lessons Completed"
						/>
						<ProgressCard
							value={lessonProgress.data?.tests_submitted}
							label="Tests Completed"
						/>
						<ProgressCard
							value={lessonProgress.data?.total_tests}
							label="Total Tests"
						/>
						<ProgressCard
							value={lessonProgress.data?.tests_approved}
							label="Tests Approved"
						/>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{course.data?.title}</CardTitle>
					<CardDescription>
						{course.data?.description}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Grid>
						<Section title="Lessons">
							{course.data?.lessons.map((lesson: any) => {
								return (
									<Card2
										Icon={BookIcon}
										title={lesson.lesson_localizations[0]?.title}
										description={""}
										href={`/dashboard/courses/${course.data.id}/lessons/${lesson.id}`}
									/>
								)
							})}
						</Section>
						<Section title="Tests">
							{course.data?.tests.map((test: any) => (
								<Card2
									Icon={ClipboardIcon}
									title={test.test_localizations[0]?.title}
									description={test.test_localizations[0]?.description}
									href={`/dashboard/courses/${course.data.id}/tests/${test.id}`}
								/>
							))}
						</Section>
					</Grid>
				</CardContent>
				<CardFooter>
					<div className="flex flex-col gap-3">
						<div>
							<h2 className="text-lg font-medium">
								Course Overview
							</h2>
							<p className="text-sm text-gray-500 dark:text-gray-400">
								This course is designed to provide a solid
								foundation in web development. You'll learn how
								to build responsive and accessible websites from
								scratch, using HTML, CSS, and JavaScript. By the
								end of the course, you'll have the skills to
								create your own web applications.
							</p>
						</div>
						<Button>Enroll Now</Button>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}

// Grid.tsx
const Grid = ({ children }: { children: React.ReactNode }) => (
	<div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
);

// Section.tsx
const Section = ({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) => (
	<ScrollArea className="h-[270px] w-full rounded-md border p-4">
		<h2 className="text-lg font-medium mb-4">{title}</h2>
		<div className="space-y-4">{children}</div>
	</ScrollArea>
);

// Card.tsx
const Card2 = ({
	Icon,
	title,
	description,
	href,
}: {
	Icon: any;
	title: string;
	description: string;
	href: string;
}) => (
	<Link href={href} className="flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-lg transition-all">
		<div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
			<Icon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
		</div>
		<div className="space-y-1">
			<h3 className="text-sm font-medium">{title}</h3>
			<p className="text-sm text-gray-500 dark:text-gray-400">
				{description}
			</p>
		</div>
	</Link>	
);

// ProgressCard.tsx
const ProgressCard = ({ value, label }: { value?: string; label: string }) => (
	<div>
		<p className="text-2xl font-bold">{value}</p>
		<p className="text-gray-500 dark:text-gray-400">{label}</p>
	</div>
);
