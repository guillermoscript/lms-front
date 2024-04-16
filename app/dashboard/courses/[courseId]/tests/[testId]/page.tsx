import { Sidebar } from "@/components/dashboard/Sidebar";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import TestForm from "@/components/courses/TestForm";
import dayjs from "dayjs";
import Link from "next/link";
import remarkGfm from "remark-gfm";
import Markdown from "react-markdown";
import { Separator } from "@/components/ui/separator";
import SubmitedAnswers from "@/components/courses/SubmitedAnswers";

export default async function Dashboard({
	params,
}: {
	params: { courseId: string; testId: string };
}) {
	const cookieStore = cookies();
	const supabase = createClient(cookieStore);

	const user = await supabase.auth.getUser();
	const userProfile = await supabase
		.from("profiles")
		.select("*")
		.eq("id", user.data.user?.id)
		.single();

	const test = await supabase
		.from("tests")
		.select(
			`*,
      		test_questions ( *,
				question_options ( *,
					question_option_localizations ( * )
				),
				test_question_localizations ( * )	
			),
			test_localizations ( * )
    	`
		)
		.eq("course_id", params.courseId)
		.eq(
			"test_localizations.language_code",
			userProfile.data?.preferred_language || "en"
		)
		.eq(
			"test_questions.test_question_localizations.language_code",
			userProfile.data?.preferred_language || "en"
		)
		.eq(
			"test_questions.question_options.question_option_localizations.language_code",
			userProfile.data?.preferred_language || "en"
		)
		.eq("id", params.testId)

		.single();

	const testSubmissions = await supabase
		.from("test_submissions")
		.select(
			`*,
			submission_answers ( * )
		`
		)
		.eq("test_id", params.testId)
		.eq("user_id", user.data.user?.id)
		.single();

	console.log(test);
	console.log(testSubmissions);

	return (
		<div className="flex-1 p-4 overflow-y-auto w-full flex flex-col gap-4">
			<div className="min-h-full flex gap-4 w-full  overflow-hidden justify-between ">
				<div className="flex-1 p-4 overflow-y-auto w-full flex flex-col gap-4">
					<h1 className="text-3xl font-semibold text-left tracking-tight">
						{test.data?.test_localizations[0].title}
					</h1>
					<h2 className="text-xl text-left tracking-tight">
						{test.data?.test_localizations[0].description}
					</h2>
					<Separator />
					<div className="flex py-3 flex-col gap-4">
						{testSubmissions.data ? (
							<div className="flex flex-col gap-4">
								{testSubmissions.data.score ? (
									<div className="flex flex-col gap-4">
										<div className="flex gap-4 h-8">
											<h2 className="text-xl font-semibold text-left tracking-tight">
												{dayjs(
													testSubmissions.data
														.submitted_at
												).format("DD/MM/YYYY")}
											</h2>
											<Separator orientation="vertical" />
											<p className="text-lg font-semibold text-left tracking-tight">
												Calificación: {" "}
												{testSubmissions.data.score >=
												10 ? (
													<span className="text-green-500">
														{
															testSubmissions.data
																.score
														}
													</span>
												) : (
													<span className="text-red-500">
														{
															testSubmissions.data
																.score
														}
													</span>
												)}
											</p>
											<Separator orientation="vertical" />
											<p className="text-lg font-semibold text-left tracking-tight">
												Estado:{" "}
												{testSubmissions.data
													.is_approved ? (
													<span className="text-green-500">
														Aprobado
													</span>
												) : (
													<span className="text-red-500">
														Reprobado
													</span>
												)}
											</p>
										</div>
										{testSubmissions.data
											.teacher_review && (
											<div className="flex pt-4 flex-col gap-4">
												<h3 className="text-lg font-semibold text-left tracking-tight">
													comentario del profesor:{" "}
												</h3>
												<Markdown
													className={" markdown-body"}
													remarkPlugins={[remarkGfm]}
												>
													{
														testSubmissions.data
															.teacher_review
													}
												</Markdown>
											</div>
										)}
										<Separator />
										<SubmitedAnswers
											testId={params.testId}
										/>
									</div>
								) : (
									<>
										<h2 className="text-lg font-semibold text-left tracking-tight">
											Ya has realizado este examen. espera
											a que el profesor lo califique.
										</h2>
										<Separator />
										<SubmitedAnswers
											testId={params.testId}
										/>
									</>
								)}
							</div>
						) : (
							<TestForm
								test_id={test.data?.id}
								test_questions={test.data?.test_questions}
								course_id={params.courseId}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
