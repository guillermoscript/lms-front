'use server'
import { createClient } from "@/utils/supabase/server";
import { Database } from "@/utils/supabase/supabase";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Tables } from "@/utils/supabase/supabase";
import { createResponse } from "@/utils/functions";


export type ApiResponse<T> = {
	status: "success" | "error" | "idle";
	message: string;
	data?: T;
	error?: any;
};

export const testActionSubmit = async (formData: FormData) => {

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return createResponse('error', 'You must be logged in to submit a test', null);
    }

    if (!formData) {
        return createResponse('error', 'No form data was submitted', null);
    }

    const test = await supabase
        .from('test_submissions')
        .insert([
            { test_id: (parseInt(formData.get('test_id')?.toString())), user_id: user.id }
        ])
        .select().single()

    const test_submission_id = test.data?.id

    console.log(formData)
    let questions: Array<{
        question_id: number,
        answer?: string
    }> = []

    formData.forEach((value, key) => {
        if (key.includes('-') && value === 'on') {
            // its a multiple choice question
            console.log(key)
            const question_id = parseInt(key.split('-')[0])
            const answer_id = parseInt(key.split('-')[1])
            questions.push({ question_id, answer: answer_id.toString() })
        } else if (key !== 'test_id') {
            // its a fill in question
            console.log(key)
            const question_id = parseInt(key)
            const answer = value.toString()
            questions.push({ question_id, answer })
        }

    });

    console.log(questions)

    try {

        const questions_submitted = await supabase.from('submission_answers').insert(
            questions.map((question) => {
                return {
                    submission_id: test_submission_id,
                    question_id: question.question_id,
                    given_answer: question.answer
                }
            })
        ).select()

        console.log(questions_submitted)

        revalidatePath(`/dashboard/courses/${formData.get('course_id')}/tests/${formData.get('test_id')}`)
    } catch (error) {
        console.log(error)
        return false
    }
}

export const writeComment = async (prevData: any, formData: FormData) => {

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    console.log(formData, "<== formData")

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return createResponse('error', 'You must be logged in to submit a comment', null);
    }

    if (!formData) {
        return createResponse('error', 'No form data was submitted', null);
    }

    const content = formData.get('content') as string
    const content_type = formData.get('content_type') as string
    const entity_id = Number(formData.get('entity_id')?.toString())
    const entity_type = formData.get('entity_type') as string

    console.log(content, content_type, entity_id, entity_type, "<== formData")

    try {
        const comment = await supabase
        .from('comments')
        .insert({
            user_id: user?.id,
            content,
            content_type,
            entity_id,
            entity_type
        })
        .select()
    
        const urlToRefresh = formData.get('refresh_url')?.toString() as string
        console.log(comment)
        revalidatePath(urlToRefresh)

        return createResponse('success', 'Comment submitted successfully', comment);
    } catch (error) {
        console.log(error)
        return createResponse('error', 'Error submitting comment', null, error);
    }

}

export const updateProfile = async (formData: FormData) => {

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return createResponse('error', 'You must be logged in to submit a comment', null);
    }

    if (!formData) {
        return createResponse('error', 'No form data was submitted', null);
    }

    if (!formData.get("name")) {
        return createResponse('error', 'No name was submitted', null);
    };

    if (!formData.get("bio")) {
        return createResponse('error', 'No bio was submitted', null);
    };

    if (!formData.get("photo")) {
        return createResponse('error', 'No photo was submitted', null);
    };

    const { data, error } = await supabase
        .from("profiles")
        .update({
            bio: formData.get("bio") as string,
            full_name: formData.get("name") as string,
            avatar_url: formData.get("photo") as string,
        })
        .eq("id", user?.id);

    if (error) {
        console.log(error);
    }

    if (data) {
        console.log(data);
        revalidatePath("/dashboard/account")
    }
    return data;
};


export const upsertLessonProgress = async (lesson_id: number, progress: Database['public']['Tables']['lesson_progress']['Row']['progress_status'], id?: number) => {

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return createResponse('error', 'You must be logged in to submit a comment', null);
    }

    if (!lesson_id) {
        return createResponse('error', 'No lesson id was submitted', null);
    };

    if (!progress) {
        return createResponse('error', 'No progress was submitted', null);
    };

    // check if progress type is valid
    if (progress !== 'completed' && progress !== 'in_progress' && progress !== 'not_started') {
        return createResponse('error', 'Progress type is not valid', null);
    }

    const { data, error } = await supabase
        .from("lesson_progress")
        .upsert({
            user_id: user?.id,
            lesson_id,
            id,
            progress_status: progress
        })
        .eq("user_id", user?.id)
        .eq("lesson_id", lesson_id);

    if (error) {
        console.log(error);
        return createResponse('error', 'Error upserting lesson progress', null, error);
    }

    return createResponse('success', 'Successfully upserted lesson progress', data);

}


interface Option {
    label: string;
    value: boolean;
    correct: boolean;
}

interface FormField {
    type: 'fill_in' | 'multiple_choices' | 'true_false';
    label: string;
    options?: Option[];
    required: boolean;
    value?: boolean;
}

interface TestInput {
    language: string[];
    testName: string;
    testDescription: string;
    course: string | number;
    retakeInterval: string;
    timeForTest: string;
    formFields: FormField[];
}

type Test = Tables<'tests'>

export const saveTest = async (test: TestInput) => {
    // Helper function to validate the input structure
    function validateTestInput(testInput: TestInput): boolean {
        console.log(testInput)
        // Add more validations as per your requirements
        if (!testInput.language || !testInput.language.length) {
            throw new Error('Language must be provided and cannot be empty.');
        }
        if (!testInput.testName) {
            throw new Error('Test name cannot be empty.');
        }
        if (isNaN(Number(testInput.course))) {
            throw new Error('Invalid course ID.');
        }
        if (isNaN(Number(testInput.timeForTest))) {
            throw new Error('Invalid time for test.');
        }
        if (!/^\d+$/.test(testInput.retakeInterval)) {
            throw new Error('Invalid retake interval format.');
        }
        for (const field of testInput.formFields) {
            if (!['fill_in', 'multiple_choices', 'true_false'].includes(field.type)) {
                throw new Error(`Invalid question type: ${field.type}`);
            }
            if (field.type === 'multiple_choices' && (!field.options || !field.options.length)) {
                throw new Error('Options must be provided for multiple choice questions.');
            }
        }
        return true;
    }

    async function insertNewTest(testInput: TestInput) {
        // Insert into 'tests' table

        const cookieStore = cookies();
        const supabase = createClient(cookieStore);
        const testData = {
            course_id: testInput.course,
            retake_interval: testInput.retakeInterval,
            time_for_test: testInput.timeForTest,
        } as unknown as Test
        const test = await supabase
            .from('tests')
            .insert([
                testData
            ])
            .select().single();

        if (test.error) throw new Error(`Error inserting test: ${test.error.message}`);


        console.log(test)
        // Insert localizations for the test
        for (const language of testInput.language) {
            const { error: localizationError } = await supabase
                .from('test_localizations')
                .insert([
                    {
                        test_id: test?.data?.id,
                        language_code: language,
                        title: testInput.testName,
                        description: testInput.testDescription,
                    },
                ] as unknown as Tables<'test_localizations'>
                );

            if (localizationError) throw new Error(`Error inserting localization: ${localizationError.message}`);
        }

        // Insert questions and options (if applicable)
        for (const formField of testInput.formFields) {
            const question = await supabase
                .from('test_questions')
                .insert([
                    {
                        test_id: test?.data?.id,
                        question_type: formField.type,
                    },
                ] as unknown as Tables<'test_questions'>
                )
                .select().single();

            if (question.error) throw new Error(`Error inserting question: ${question.error.message}`);

            // Insert question localizations
            for (const language of testInput.language) {
                const { error } = await supabase
                    .from('test_question_localizations')
                    .insert([
                        {
                            question_id: question.data?.id,
                            language_code: language,
                            question_text: formField.label,
                        },
                    ] as unknown as Tables<'test_question_localizations'>);

                if (error) throw new Error(`Error inserting question localization: ${error.message}`);
            }

            // Insert options for 'multiple_choices' questions
            if (formField.type === 'multiple_choices' && formField.options) {
                for (const option of formField.options) {
                    const questionOption = await supabase
                        .from('question_options')
                        .insert([
                            {
                                question_id: question.data?.id,
                                is_correct: option.correct,
                            },
                        ] as unknown as Tables<'question_options'>
                        )
                        .select().single();

                    if (questionOption.error) throw new Error(`Error inserting question option: ${questionOption.error.message}`);

                    // Insert option localizations
                    for (const language of testInput.language) {
                        const { error } = await supabase
                            .from('question_option_localizations')
                            .insert([
                                {
                                    option_id: questionOption.data?.id,
                                    language_code: language,
                                    option_text: option.label,
                                },
                            ] as unknown as Tables<'question_option_localizations'>);

                        if (error) throw new Error(`Error inserting option localization: ${error.message}`);
                    }
                }
            }
        }

        return `Test with ID ${test.data?.id} inserted successfully.`;
    }

    try {
        validateTestInput(test);
        const result = await insertNewTest(test);
        return createResponse('success', result, null);
    }
    catch (error) {
        return createResponse('error', error?.message, null, error);
    }

}