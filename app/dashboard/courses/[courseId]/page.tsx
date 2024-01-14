import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
		.rpc('get_course_progress', {
			course_id_arg: Number(course.data?.id),
			user_id_arg: user?.id as string,
		})
		.single()

		console.log(lessonProgress)

	return (
		<div className="flex-1 p-4 overflow-y-auto w-full flex flex-col gap-4">
			<h1 className="text-3xl font-semibold text-left tracking-tight">
				{course.data?.title}
			</h1>

			<h3 className="text-xl font-semibold text-left tracking-tight">
				{course.data?.description}
			</h3>

			<div className="flex flex-wrap gap-4">
				<Card
					className="w-56"
				>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total progress
						</CardTitle>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							className="h-4 w-4 text-muted-foreground"
						>
							<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
						</svg>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{" "}
							{lessonProgress?.data?.progress_percentage}%
						</div>
					</CardContent>
				</Card>
				<Card
					className="w-56"
				>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total lessons
						</CardTitle>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							className="h-4 w-4 text-muted-foreground"
						>
							<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">+{lessonProgress.data?.total_lessons}</div>
					</CardContent>
				</Card>
				<Card
					className="w-56"
				>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Lessons completed
						</CardTitle>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							className="h-4 w-4 text-muted-foreground"
						>
							<rect width="20" height="14" x="2" y="5" rx="2" />
							<path d="M2 10h20" />
						</svg>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">+{lessonProgress.data?.completed_lessons}</div>
					</CardContent>
				</Card>
				<Card
					className="w-56"
				>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Test completed
						</CardTitle>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							className="h-4 w-4 text-muted-foreground"
						>
							<rect width="20" height="14" x="2" y="5" rx="2" />
							<path d="M2 10h20" />
						</svg>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">+{lessonProgress.data?.tests_submitted}</div>
					</CardContent>
				</Card>
				<Card
					className="w-56"
				>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Tests
						</CardTitle>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							className="h-4 w-4 text-muted-foreground"
						>
							<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">+{lessonProgress.data?.total_tests}</div>
					</CardContent>
				</Card>
				<Card
					className="w-56"
				>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Test approved
						</CardTitle>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							className="h-4 w-4 text-muted-foreground"
						>
							<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">+{lessonProgress.data?.tests_approved}</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
