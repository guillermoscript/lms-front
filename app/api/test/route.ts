import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const frontendJSON = await req.json();
        const supabase = createClient();
        const transformedJSON = {
            p_course_id: frontendJSON.course,
            p_retake_interval: `${frontendJSON.retakeInterval} minutes`,
            p_time_for_test: frontendJSON.timeForTest,
            p_status: frontendJSON.status || 'published',
            p_sequence: frontendJSON.sequence,
            p_localizations: frontendJSON.language.map(lang => ({
                language_code: lang,
                title: frontendJSON.testName,
                description: frontendJSON.testDescription
            })),
            p_questions: frontendJSON.formFields.map(field => ({
                question_type: field.type,
                value: field.value,
                localizations: frontendJSON.language.map(lang => ({
                    language_code: lang,
                    question_text: field.label
                })),
                options: field.options?.map(option => ({
                    is_correct: option.correct,
                    localizations: frontendJSON.language.map(lang => ({
                        language_code: lang,
                        option_text: option.label
                    }))
                }))
            }))
        };
        console.log(transformedJSON, 'transformedJSON');

        const { data, error } = await supabase
            .rpc('save_full_test', {
                p_course_id: transformedJSON.p_course_id,
                p_retake_interval: transformedJSON.p_retake_interval,
                p_time_for_test: transformedJSON.p_time_for_test,
                p_status: transformedJSON.p_status,
                p_sequence: transformedJSON.p_sequence,
                p_localizations: transformedJSON.p_localizations,
                p_questions: transformedJSON.p_questions
            });

        if (error) {
            console.error(error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error?.message }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const frontendJSON = await req.json();
        const supabase = createClient();
        const transformedJSON = {
            p_test_id: frontendJSON.testId,
            p_course_id: frontendJSON.course,
            p_retake_interval: `${frontendJSON.retakeInterval} minutes`,
            p_time_for_test: frontendJSON.timeForTest,
            p_status: frontendJSON.status || 'published',
            p_sequence: frontendJSON.sequence,
            p_localizations: frontendJSON.language.map(lang => ({
                language_code: lang,
                title: frontendJSON.testName,
                description: frontendJSON.testDescription
            })),
            p_questions: frontendJSON.formFields.map(field => ({
                question_type: field.type,
                value: field.value,
                localizations: frontendJSON.language.map(lang => ({
                    language_code: lang,
                    question_text: field.label
                })),
                options: field.options?.map(option => ({
                    is_correct: option.correct,
                    localizations: frontendJSON.language.map(lang => ({
                        language_code: lang,
                        option_text: option.label
                    }))
                }))
            }))
        };
        console.log(transformedJSON, 'transformedJSON');

        const { data, error } = await supabase
            .rpc('update_full_test', {
                p_test_id: transformedJSON.p_test_id,
                p_course_id: transformedJSON.p_course_id,
                p_retake_interval: transformedJSON.p_retake_interval,
                p_time_for_test: transformedJSON.p_time_for_test,
                p_status: transformedJSON.p_status,
                p_sequence: transformedJSON.p_sequence,
                p_localizations: transformedJSON.p_localizations,
                p_questions: transformedJSON.p_questions
            });
        return NextResponse.json(data);

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error?.message }, { status: 500 });
    }
}