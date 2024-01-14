import ProgressForm from "@/components/courses/ProgressForm";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import Comment from "@/components/ui/comments/CommentForm";
import CommentsList from "@/components/ui/comments/CommentsList";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default async function PageLesson({
	params,
}: {
	params: { courseId: string; lessonId: string };
}) {
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);
	const user = await supabase.auth.getUser();

	const userProfile = await supabase
		.from("profiles")
		.select("*")
		.eq("id", user.data.user?.id)
		.single();

	// TODO: RLS policy to get only the courses that the user is enrolled in
	const lesson = await supabase
		.from("lessons")
		.select(
			`*,
			lesson_localizations ( * )
		`
		)
		.eq("course_id", params.courseId)
		.eq("id", params.lessonId)
		.eq('lesson_localizations.language_code', userProfile.data?.preferred_language || 'en')
		.single();

	const prevLessons = await supabase
		.from("lessons")
		.select("*")
		.eq("course_id", params.courseId)
		.neq("id", params.lessonId)
		.order("id", { ascending: true })
		.lt("sequence", lesson.data?.sequence)
		.single();

	const nextLessons = await supabase
		.from("lessons")
		.select("*")
		.eq("course_id", params.courseId)
		.neq("id", params.lessonId)
		.order("id", { ascending: true })
		.gt("sequence", lesson.data?.sequence)
		.single();

	const lessonProgress = await supabase
		.from("lesson_progress")
		.select(`*`)
		.eq("lesson_id", params.lessonId)
		.single();

	console.log(lesson);

	return (
		<>
			<div className="flex-1 p-2 overflow-y-auto w-full flex-col gap-3 ">
				<div className="flex justify-between items-center">
					<h1 className="text-3xl font-semibold text-left tracking-tight mb-4">
						{lesson.data?.lesson_localizations[0].title}
					</h1>

					{lessonProgress?.data?.progress_status === "completed" ? (
						<Badge>Lección completada</Badge>
					) : lessonProgress?.data?.progress_status ===
					  "in_progress" ? (
						<Badge variant="secondary">Lección en progreso</Badge>
					) : (
						<Badge variant="outline">Lección no iniciada</Badge>
					)}
				</div>
				{lesson.data?.video_url && (
					<div className="flex flex-col mb-10 gap-4">
						<h2 className="text-xl font-semibold text-left tracking-tight">
							Video
						</h2>
						<iframe
							className="w-full"
							height="415"
							src={lesson.data?.video_url}
							title="YouTube video player"
							frameBorder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowFullScreen
						></iframe>
					</div>
				)}

				{lesson.data?.embed ? (
					<div className="flex flex-col mb-10 gap-4">
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
				<Markdown
					className={` markdown-body`}
					remarkPlugins={[remarkGfm]}
				>
					{lesson.data?.lesson_localizations[0].content}
				</Markdown>
				<div className="flex justify-between">
					{prevLessons?.data && (
						<div className="flex justify-start gap-4">
							<a
								href={`/dashboard/courses/${params.courseId}/lessons/${prevLessons.data.id}`}
								className="text-lg font-semibold tracking-tight"
							>
								Previous lesson
							</a>
						</div>
					)}
					{nextLessons?.data && (
						<div className="flex justify-end gap-4">
							<a
								href={`/dashboard/courses/${params.courseId}/lessons/${nextLessons.data.id}`}
								className="text-lg font-semibold tracking-tight"
							>
								Next lesson
							</a>
						</div>
					)}

					<ProgressForm
						lessonId={lesson.data?.id}
						progressStatus={
							lessonProgress?.data?.progress_status ||
							"not_started"
						}
					/>
				</div>
			</div>
			<div className="p-2 overflow-y-auto flex-col md:w-1/4">
				<h3 className="text-3xl font-semibold text-left tracking-tight">
					Comments
				</h3>
				<Comment entityId={lesson.data?.id} entityType="lesson" />
				<CommentBox lessonId={lesson.data?.id} />
			</div>
		</>
	);
}

function CommentBox({ lessonId }: { lessonId: string }) {
	const where = {
		entity_id: lessonId,
		entity_type: "lesson",
	};
	return <CommentsList where={where} />;
}
