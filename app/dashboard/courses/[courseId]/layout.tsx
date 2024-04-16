import { Sidebar } from "@/components/dashboard/Sidebar";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

export default async function LayoutLessonId({
	params,
	children,
}: {
	params: { courseId: string; lessonId: string };
	children: React.ReactNode;
}) {
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);

	const user = await supabase.auth.getUser();
	const userProfile = await supabase
		.from("profiles")
		.select("*")
		.eq("id", user.data.user?.id)
		.single();

	const tests = await supabase
		.from("tests")
		.select(
			`*,
			test_localizations ( * )        
		`
		)
		.eq("course_id", params.courseId)
		.eq('test_localizations.language_code', userProfile.data?.preferred_language || 'en')

	const lessons = await supabase
		.from("lessons")
		.select(`*,
			lesson_localizations ( * )
		`)
		.eq("course_id", params.courseId)
		.eq('lesson_localizations.language_code', userProfile.data?.preferred_language || 'en')
		.order("sequence", { ascending: true });

		console.log(tests.data)

	return (
		<div className="min-h-full flex gap-4 w-full md:flex-row flex-col overflow-hidden justify-between ">
			<Sidebar>
				<div className="flex flex-col items-start gap-4">
					<h4 className="text-lg font-semibold text-left tracking-tight">
						Lecciones del curso
					</h4>
					{lessons.data?.map((lesson) => {
						return (
							<Link
								className={`${buttonVariants({
									variant: "link",
								})} text-left`}
								href={`/dashboard/courses/${params.courseId}/lessons/${lesson.id}`}
							>
								{lesson.lesson_localizations[0]?.title}
							</Link>
						);
					})}
				</div>
				<Separator />
				<div className="flex flex-col items-start gap-4">
					<h4 className="text-lg font-semibold text-left tracking-tight">
						Examenes del curso
					</h4>
					{tests.data?.map((test) => {
						return (
							<Link
								className={buttonVariants({
									variant: "link",
								})}
								href={`/dashboard/courses/${params.courseId}/tests/${test.id}`}
							>
								{test?.test_localizations[0]?.title}
							</Link>
						);
					})}
				</div>
			</Sidebar>
            {children}         
		</div>
	);
}
