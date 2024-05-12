import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default async function LessonPage({
	params,
}: {
	params: { courseId: string; lessonId: string };
}) {
	const supabase = createClient();

	const lesson = await supabase
		.from("lessons")
		.select(`*, lesson_localizations(*), courses(*)`)
		.eq("id", params.lessonId)
		.single();

	if (lesson.error) {
		console.log(lesson.error.message);
	}

	console.log(lesson.data);

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
							{lesson?.data?.courses?.title}
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							href={`/dashboard/teacher/courses/${params.courseId}/${params.lessonId}`}
						>
							{lesson?.data?.lesson_localizations[0].title}
						</BreadcrumbLink>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<div className="flex justify-between items-center w-full">
				<h1 className="text-2xl font-semibold mb-4">
					Lesson: {lesson?.data?.lesson_localizations[0].title}
				</h1>
				<Link
					href={`/dashboard/teacher/courses/${params.courseId}/lessons/${params.lessonId}/edit`}
					className={buttonVariants({ variant: "link" })}
				>
					Edit
				</Link>
			</div>

			<h3 className="text-lg font-semibold mt-4">
				Status: {lesson?.data?.status}
			</h3>
			<h3 className="text-lg font-semibold mt-4">
				Sequence: {lesson?.data?.sequence}
			</h3>

			{lesson.data?.video_url && (
				<>
					<h3 className="text-lg font-semibold mt-4">
						Youtube Video
					</h3>
					<iframe
						className="w-full"
						height="415"
						src={lesson.data?.video_url}
						title="YouTube video player"
						frameBorder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowFullScreen
					></iframe>
				</>
			)}

			{lesson.data?.embed ? (
				<div className="flex flex-col mb-10 gap-4">
					<h3 className="text-lg font-semibold mt-4">Embeded Code</h3>
					<iframe
						src={lesson.data?.embed}
						style={{
							width: "100%",
							height: 600,
							border: 0,
							borderRadius: 4,
							overflow: "hidden",
						}}
						title="htmx basic website"
						allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
						sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
						className="resize "
					/>
				</div>
			) : null}

			<p>{lesson?.data?.lesson_localizations[0]?.description}</p>

			<Markdown className={` markdown-body`} remarkPlugins={[remarkGfm]}>
				{lesson.data?.lesson_localizations[0].content}
			</Markdown>
		</div>
	);
}
