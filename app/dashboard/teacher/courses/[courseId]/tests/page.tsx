import TeacherTestForm from "@/components/form/TeacherTestForm";
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/utils/supabase/server";

export default async function TestFormPage({
	params,
}: {
	params: { courseId: string };
}) {
	const supabase = createClient();
	const course = await supabase
		.from("courses")
		.select(`*`)
		.eq("id", params.courseId)
		.single();

	if (course.error) {
		console.log(course.error.message);
	}

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
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							href={`/dashboard/teacher/courses/${params.courseId}/tests`}
						>
							Tests
						</BreadcrumbLink>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<TeacherTestForm />
		</div>
	);
}
