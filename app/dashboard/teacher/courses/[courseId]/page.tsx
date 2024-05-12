import { createClient } from "@/utils/supabase/server";
import { lessonsCols } from "./lessonsCols";
import { DataTable } from "@/components/ui/Table/data-table";
import dayjs from "dayjs";
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { testsCols } from "./testsCols";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function CreateCourseLessonPage({
	params,
}: {
	params: { courseId: string };
}) {
	const supabase = createClient();

	const course = await supabase
		.from("courses")
		.select(
			`* , 
    lessons ( 
        * , 
        lesson_localizations( * )
    ), 
    tests (
         * ,
        test_localizations (*)
    )`
		)
		.eq("id", params.courseId)
		.single();

	if (course.error) {
		console.log(course.error.message);
	}

	console.log(course.data);

	const lessonRow = course.data?.lessons?.map((lesson) => {
		return {
			id: lesson.id,
			title: lesson.lesson_localizations[0]?.title,
			description: lesson.lesson_localizations[0]?.description,
			sequence: lesson.sequence,
			date: dayjs(lesson.created_at).format("DD/MM/YYYY"),
			courseId: lesson.course_id,
		};
	});

	const testRow = course.data?.tests?.map((test) => {
		return {
			id: test.id,
			title: test.test_localizations[0]?.title,
			description: test.test_localizations[0]?.description,
			sequence: test.sequence,
			date: dayjs(test.created_at).format("DD/MM/YYYY"),
			courseId: test.course_id,
		};
	});

	console.log(testRow);

	return (
		<div className="flex-1 p-8 overflow-y-auto w-full space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href="/dashboard">
							Dashboard
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink href="/dashboard/teacher">
							Teacher
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink href="/dashboard/teacher/courses">
							Courses
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							href={`/dashboard/teacher/courses/${params.courseId}`}
						>
							{course?.data?.title}
						</BreadcrumbLink>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<h1 className="text-2xl font-semibold  mb-4">
				Course: {course?.data?.title}
			</h1>
			<p>{course?.data?.description}</p>

			<Separator className="my-4 " />
			<Tabs defaultValue="lessons" className="w-full space-y-4">
				<TabsList>
					<TabsTrigger value="lessons">Lessons</TabsTrigger>
					<TabsTrigger value="tests">Tests</TabsTrigger>
				</TabsList>
				<TabsContent
					className="flex flex-col  w-full  gap-4"
					value="lessons"
				>
					<div className="flex items-center justify-between">
						<h3 className="text-xl font-semibold">Lessons</h3>
						<Link
							className={buttonVariants({ variant: "link" })}
							href={`/dashboard/teacher/courses/${params.courseId}/lessons/`}
						>
							Create Lesson
						</Link>
					</div>
					<DataTable columns={lessonsCols} data={lessonRow} />
				</TabsContent>
				<TabsContent
					className="flex flex-col  w-full  gap-4"
					value="tests"
				>
					<div className="flex items-center justify-between">
						<h3 className="text-xl font-semibold">Tests</h3>
						<Link
							className={buttonVariants({ variant: "link" })}
							href={`/dashboard/teacher/courses/${params.courseId}/tests/`}
						>
							Create Test
						</Link>
					</div>

					<DataTable columns={testsCols} data={testRow} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
