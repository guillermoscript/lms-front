import { FreeTextQuestionRead } from "@/components/dashboard/teacher/test/FreeTextQuestion";
import MultipleChoiceQuestion from "@/components/dashboard/teacher/test/MultipleChoiceQuestion";
import SingleSelectQuestion from "@/components/dashboard/teacher/test/SingleSelectQuestion";
import categorizeQuestions from "@/components/dashboard/teacher/test/utils/categorizeQuestions";
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/utils/supabase/server";

import Link from "next/link";

export default async function LessonPage({
	params,
}: {
	params: { courseId: string; testId: string };
}) {
	const supabase = createClient();

	const test = await supabase
		.from("tests")
		.select(
			`* ,
            test_localizations (*), 
            courses (*),
            test_questions(
				*,
                test_question_localizations(*),
				question_options(*,
					question_option_localizations(*)
				)
            )
        `
		)
		.eq("id", params.testId)
		.single();

	if (test.error) {
		console.log(test.error.message);
	}

	console.log(test.data?.test_questions)
	const {
		multipleChoiceQuestions,
		freeTextQuestions,
		singleSelectQuestions,
	} = categorizeQuestions(test.data?.test_questions);

	console.log(multipleChoiceQuestions)

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
							{test?.data?.courses?.title}
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink
							href={`/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}`}
						>
							{test?.data?.test_localizations[0].title}
						</BreadcrumbLink>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<div className="flex justify-between items-center w-full">
				<h1 className="text-2xl font-semibold mb-4">
					Test: {test?.data?.test_localizations[0]?.title}
				</h1>
				<Link
					href={`/dashboard/teacher/courses/${params.courseId}/tests/${params.testId}/edit`}
					className={buttonVariants({ variant: "link" })}
				>
					Edit
				</Link>
			</div>

			<h3 className="text-lg font-semibold mt-4">
				Status: {test?.data?.status}
			</h3>
			<h3 className="text-lg font-semibold mt-4">
				Sequence: {test?.data?.sequence}
			</h3>
			<div className="space-y-4">
				<h2 className="text-2xl font-bold">JavaScript Basics Test</h2>
				<p className="text-gray-500 dark:text-gray-400">
					This test will evaluate your understanding of JavaScript
					fundamentals.
				</p>
				<>
					{singleSelectQuestions.length > 0 && (
						<div>
							<h3 className="text-lg font-semibold">
								True or False
							</h3>
							<SingleSelectQuestion
								questions={singleSelectQuestions}
							/>
						</div>
					)}
					<Separator className="my-4" />
					{freeTextQuestions.length > 0 && (
						<div>
							<h3 className="text-lg font-semibold">
								Fill in the Blank
							</h3>
							<FreeTextQuestionRead
								questions={freeTextQuestions}
							/>
						</div>
					)}
					<Separator className="my-4" />
					{multipleChoiceQuestions.length > 0 && (
						<div>
							<h3 className="text-lg font-semibold">
								Multiple Choice
							</h3>
							<MultipleChoiceQuestion
								questions={multipleChoiceQuestions}
							/>
						</div>
					)}
				</>
			</div>
		</div>
	);
}
