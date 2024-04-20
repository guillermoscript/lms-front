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
		.from("courses")
		.select("*")
		.eq("id", params.courseId)
		.single();

	const lessonProgress = await supabase
		.rpc("get_course_progress", {
			course_id_arg: Number(course.data?.id),
			user_id_arg: user?.id as string,
		})
		.single();

	console.log(lessonProgress);

	return (
		<div className="grid grid-cols-1 gap-6">
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
							<Card2
								Icon={BookIcon}
								title="Introduction to HTML"
								description="Learn the basics of HTML and how to structure web pages."
								href="/dashboard/courses/1/lessons/1"
							/>
							<Card2
								Icon={BookIcon}
								title="Intermediate CSS"
								description="Dive deeper into CSS and learn how to style your web pages."
								href="/dashboard/courses/1/lessons/2"
							/>
							<Card2
								Icon={BookIcon}
								title="JavaScript Fundamentals"
								description="Learn the basics of JavaScript and how to add interactivity to your web pages."
								href="/dashboard/courses/1/lessons/3"
							/>
						</Section>
						<Section title="Tests">
							<Card2
								Icon={ClipboardIcon}
								title="HTML and CSS Test"
								description="Test your knowledge of HTML and CSS."
								href="/dashboard/courses/1/tests/1"
							/>
							<Card2
								Icon={ClipboardIcon}
								title="JavaScript Fundamentals Test"
								description="Test your understanding of JavaScript basics."
								href="/dashboard/courses/1/tests/2"
							/>
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
const Grid = ({ children }:{
	children: React.ReactNode;
}) => (
	<div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
);

// Section.tsx
const Section = ({ title, children }:{
	title: string;
	children: React.ReactNode;
}) => (
	<div>
		<h2 className="text-lg font-medium mb-4">{title}</h2>
		<div className="space-y-4">{children}</div>
	</div>
);

// Card.tsx
const Card2 = ({ Icon, title, description , href}:{
	Icon: any;
	title: string;
	description: string;
	href: string;
}) => (
	<div className="flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded-lg transition-all">
		<div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
			<Icon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
		</div>
		<Link
			href={href}
			className="space-y-1"
		>
			<h3 className="text-sm font-medium">{title}</h3>
			<p className="text-sm text-gray-500 dark:text-gray-400">
				{description}
			</p>
		</Link>
	</div>
);
