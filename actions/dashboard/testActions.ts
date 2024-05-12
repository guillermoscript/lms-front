"use server";
import { createResponse } from "@/utils/functions";
import { createClient } from "@/utils/supabase/server";
import { Tables } from "@/utils/supabase/supabase";
import { revalidatePath } from "next/cache";

export async function deleteTestAction(data: {
    testId: string;
}) {
    const testId = data.testId;

    if (!testId) {
        return createResponse("error", "Lesson id is required", null, "Lesson id is required");
    }

    const supabase = createClient();
    const lessonData = await supabase
        .from('tests')
        .delete()
        .eq("id", testId);

    if (lessonData.error) {
        console.log(lessonData.error);
        return createResponse("error", "Error deleting lesson", null, "Error deleting lesson");
    }

    revalidatePath('/dashboard/teacher/courses/[courseId]', 'layout');
    return createResponse("success", "Lesson deleted successfully", null, null);
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

async function handleTest(testInput: TestInput, testId?: string) {
    // Insert or update 'tests' table
    const supabase = createClient();
    const testData = {
        course_id: testInput.course,
        retake_interval: testInput.retakeInterval,
        time_for_test: testInput.timeForTest,
    } as unknown as Test
    const test = testId
        ? await supabase.from('tests').update(testData).eq('id', testId).select().single()
        : await supabase.from('tests').insert([testData]).select().single();

    if (test.error) throw new Error(`Error handling test: ${test.error.message}`);

    // Handle localizations for the test
    for (const language of testInput.language) {
        const localizationData = {
            test_id: test?.data?.id,
            language_code: language,
            title: testInput.testName,
            description: testInput.testDescription,
        } as unknown as Tables<'test_localizations'>

        const { error: localizationError } = testId
            ? await supabase.from('test_localizations').update(localizationData).eq('test_id', testId).eq('language_code', language)
            : await supabase.from('test_localizations').insert([localizationData]);

        if (localizationError) throw new Error(`Error handling localization: ${localizationError.message}`);
    }

    // Handle questions and options (if applicable)
    for (const formField of testInput.formFields) {
        const questionData = {
            test_id: test?.data?.id,
            question_type: formField.type,
        } as unknown as Tables<'test_questions'>

        const question = await supabase.from('test_questions').insert([questionData]).select().single();

        if (question.error) throw new Error(`Error inserting question: ${question.error.message}`);

        // Handle question localizations
        for (const language of testInput.language) {
            const questionLocalizationData = {
                question_id: question.data?.id,
                language_code: language,
                question_text: formField.label,
            } as unknown as Tables<'test_question_localizations'>

            const { error } = await supabase.from('test_question_localizations').insert([questionLocalizationData]);

            if (error) throw new Error(`Error inserting question localization: ${error.message}`);
        }

        // Handle options for 'multiple_choices' questions
        if (formField.type === 'multiple_choices' && formField.options) {
            for (const option of formField.options) {
                const questionOptionData = {
                    question_id: question.data?.id,
                    is_correct: option.correct,
                } as unknown as Tables<'question_options'>

                const questionOption = await supabase.from('question_options').insert([questionOptionData]).select().single();

                if (questionOption.error) throw new Error(`Error inserting question option: ${questionOption.error.message}`);

                // Handle option localizations
                for (const language of testInput.language) {
                    const optionLocalizationData = {
                        option_id: questionOption.data?.id,
                        language_code: language,
                        option_text: option.label,
                    } as unknown as Tables<'question_option_localizations'>

                    const { error } = await supabase.from('question_option_localizations').insert([optionLocalizationData]);

                    if (error) throw new Error(`Error inserting option localization: ${error.message}`);
                }
            }
        }
    }

    return `Test with ID ${test.data?.id} handled successfully.`;
}


export const saveTest = async (test: TestInput) => {
    try {
        validateTestInput(test);
        const result = await handleTest(test);
        return createResponse('success', result, null);
    }
    catch (error) {
        console.log(error)
        return createResponse('error', error?.message, null, error);
    }
}

export const editTest = async (test: TestInput, testId: string) => {
    try {
        validateTestInput(test);
        const result = await handleTest(test, testId);
        return createResponse('success', result, null);
    }
    catch (error) {
        console.log(error)
        return createResponse('error', error?.message, null, error);
    }
}