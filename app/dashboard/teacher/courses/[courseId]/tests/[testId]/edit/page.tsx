import TestForm from "@/components/courses/TestForm";
import TeacherTestForm from "@/components/form/TeacherTestForm";
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

export default async function EditTestPage({
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
                test_question_localizations(*)
            )
        `
		)
		.eq("id", params.testId)
		.single();

	if (test.error) {
		console.log(test.error.message);
	}

    console.log(test.data)

    // const fieldsForQuestions = test.data?.test_questions?.map((question) => {
    //     if (question.question_type === "multiple_choice") {
    //         return {
    //             question: question.test_question_localizations[0].question_text,
    //             questionType: question.question_type,
    //             options: question.question_options.map((option) => {
    //                 return {
    //                     option: option.question_option_localizations[0].option,
    //                     isCorrect: option.is_correct
    //                 }
    //             })
    //         }
    //     }
    //     return {
    //         question: question.test_question_localizations[0].question_text,
    //         questionType: question.question_type
    //     }
    // })

    // console.log(fieldsForQuestions)

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
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink>Edit</BreadcrumbLink>
                    </BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<div className="flex justify-between items-center w-full">
				<TeacherTestForm 
                    testId={params.testId}
                    defaultValues={{
                        language: test?.data?.test_localizations[0]?.language_code,
                        testName: test?.data?.test_localizations[0].title,
                        testDescription: test?.data?.test_localizations[0]?.description,
                        course: test?.data?.course_id,
                        retakeInterval: test?.data?.retake_interval,
                        timeForTest: test?.data?.time_for_test,
                        // questions: 
                    }}
                />
			</div>
		</div>
	);
}
