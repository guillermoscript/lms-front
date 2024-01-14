'use server'
import { createClient } from "@/utils/supabase/server";
import { Database } from "@/utils/supabase/supabase";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export type ApiResponse<T> = {
    status: 'success' | 'error';
    message: string;
    data?: T;
    error?: any;
};

function createResponse<T>(status: 'success' | 'error', message: string, data?: T, error?: any): ApiResponse<T> {
    return {
        status,
        message,
        data,
        error
    };
}

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
            { test_id: (parseInt(formData.get('test_id')?.toString())), user_id: user.id}
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
            questions.push({question_id, answer: answer_id.toString()})
        } else if (key !== 'test_id') {
            // its a fill in question
            console.log(key)
            const question_id = parseInt(key)
            const answer = value.toString()
            questions.push({question_id, answer})
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

export const writeComment = async (formData: FormData) => {

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

    const comment = await supabase
        .from('comments')
        .insert({
            user_id: user?.id,
            content: formData.get('content'),
            content_type: formData.get('content_type'),
            entity_id: parseInt(formData.get('entity_id')?.toString()),
            entity_type: formData.get('entity_type'),
        })
        .select()

    console.log(comment)
    
    return comment

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