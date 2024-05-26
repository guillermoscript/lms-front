import CommentEditor from "@/components/dashboard/student/course/lessons/CommentEditor";
import LessonPage from "@/components/dashboard/student/course/lessons/LessonPage";
import TaksMessages from "@/components/dashboard/student/course/lessons/TaksMessages";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import ViewMarkdown from "@/components/ui/markdown/ViewMarkdown";
import { createClient } from "@/utils/supabase/server";
import { Tables } from "@/utils/supabase/supabase";
import { Link } from "lucide-react";

export default async function StudentLessonPage({
	params,
}: {
	params: { lessonsId: string; courseId: string };
}) {
	const supabase = createClient();
	const lessonData = await supabase
		.from("lessons")
		.select(
			`*,
            courses(*),
			lesson_comments(*,
				profiles(*)
			)
        `
		)
		.eq("id", params.lessonsId)
		.single();

	if (lessonData.error) {
		throw new Error(lessonData.error.message);
	}

	console.log(lessonData);

	return (
		<>
			<LessonPage
				sideBar={
					<SidebarContent
						lesson_id={lessonData.data.id}
						lesson_comments={lessonData.data.lesson_comments}
					/>
				}
				children={<Content lessonData={lessonData} />}
			/>
		</>
	);
}

function SidebarContent({
	lesson_id,
	lesson_comments,
}: {
	lesson_id: number;
	lesson_comments: Tables<"lesson_comments">[];
}) {
	return (
		<div className="flex flex-col gap-4">
			{lesson_comments?.map((comment) => (
				<CommentCard
					key={comment.id}
					name={comment.name}
					comment={comment.content}
				/>
			))}
			<div className="mt-4">
				<h3 className="text-lg font-medium">Add a Comment</h3>
				<CommentEditor lesson_id={lesson_id} />
			</div>
		</div>
	);
}

function Content({ lessonData }: { lessonData: any }) {
	return (
		<div className="flex flex-col gap-8 w-full">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href="/dashboard">
							Dashboard
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							className="text-primary-500 dark:text-primary-400"
							href="/dashboard/student"
						>
							Student
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							className="text-primary-500 dark:text-primary-400"
							href="/dashboard/student/courses"
						>
							Courses
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							className="text-primary-500 dark:text-primary-400"
							href={`/dashboard/student/courses/${lessonData.data.course_id}`}
						>
							{lessonData.data.courses?.title}
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							className="text-primary-500 dark:text-primary-400"
							href={`/dashboard/student/courses/${lessonData.data.course_id}/lessons/`}
						>
							Lessons
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							className="text-primary-500 dark:text-primary-400"
							href={`/dashboard/student/courses/${lessonData.data.course_id}`}
						>
							{lessonData.data.title}
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							className="text-primary-500 dark:text-primary-400"
							href={`/dashboard/student/courses/${lessonData.data.course_id}/lessons/${lessonData.data.id}`}
						>
							{lessonData.data.title}
						</BreadcrumbLink>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<div className="flex flex-col gap-8 w-full">
				<div>
					<div className="flex items-center justify-between">
						<h1 className="text-3xl font-bold">
							{lessonData.data.title}
						</h1>
						<Badge variant="default">
							Lesson # {lessonData.data.sequence}
						</Badge>
					</div>
					<p className="text-gray-500 dark:text-gray-400">
						{lessonData.data.description}
					</p>
				</div>

				{lessonData.data.video_url && (
					<>
						<h2 className="text-2xl font-bold">Video</h2>

						<iframe
							width={"100%"}
							height={"500"}
							src={lessonData.data.video_url}
							title="YouTube video player"
							frameBorder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
							referrerPolicy="strict-origin-when-cross-origin"
							allowFullScreen
						></iframe>
					</>
				)}
				<div className="prose dark:prose-invert max-w-none">
					<ViewMarkdown markdown={lessonData.data.content} />
				</div>
				<h3 className="text-2xl font-bold">Summary</h3>
				<p>Summary of the lesson</p>
			</div>
			<TaksMessages />
		</div>
	);
}

const CommentCard = ({ name, comment }: {
	name: string;
	comment: string;
}) => (
	<div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
		<div className="flex items-start gap-4">
			<Avatar>
				<AvatarImage
					src="https://github.com/shadcn.png"
					alt="@shadcn"
				/>
				<AvatarFallback>CN</AvatarFallback>
			</Avatar>
			<div>
				<h4 className="font-medium">{name}</h4>
				<ViewMarkdown markdown={comment} />
			</div>
		</div>
	</div>
);

const ResourceCard = ({ title, description }) => (
	<div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
		<h3 className="text-lg font-bold">{title}</h3>
		<p className="text-sm text-gray-500 dark:text-gray-400">
			{description}
		</p>
		<div className="mt-2">
			<Link className="text-blue-600 underline" href="#">
				View Resource
			</Link>
		</div>
	</div>
);

const ReviewCard = ({ rating, review, reviewer, date }) => (
	<div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				{/* Add logic to render stars based on rating */}
			</div>
			<p className="text-sm text-gray-500 dark:text-gray-400">
				{rating} / 5
			</p>
		</div>
		<p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
			{review}
		</p>
		<div className="mt-4 flex items-center justify-between">
			<p className="text-sm text-gray-500 dark:text-gray-400">
				Reviewed by {reviewer}
			</p>
			<p className="text-sm text-gray-500 dark:text-gray-400">{date}</p>
		</div>
	</div>
);
