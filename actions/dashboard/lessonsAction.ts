
'use server'
import { createResponse } from "@/utils/functions";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function editLessonsAction(prevDate: any, data: FormData) {

    const lessonId = data.get("lessonId") as string;
    const title = data.get("title") as string;
    const description = data.get("description") as string;
    const sequence = data.get("sequence") as string;
    const status = data.get("status") as string;
    const video_url = data.get("video_url") as string;
    const course_id = data.get("course_id") as string;
    const language = data.get("language") as string;
    const content = data.get("content") as string;

console.log(language)
    const supabase = createClient();
    const lessonData = await supabase
        .from("lessons")
        .update({
            video_url,
            status: status,
            sequence: sequence,
            updated_at: new Date(),
        })
        .eq("id", lessonId);

    const lessonLocalizationData = await supabase
        .from("lesson_localizations")
        .update({
            title,
            description,
            content,
            language_code: language,
        })
        .eq("lesson_id", lessonId)

    if (lessonData.error || lessonLocalizationData.error) {
        console.log(lessonData.error);
        console.log(lessonLocalizationData.error)
        return createResponse("error", "Error updating lesson", null, "Error updating lesson");
    }


    console.log(lessonData.data)

    revalidatePath('/dashboard/teacher/courses/[courseId]/lessons/[lessonId]', 'layout');
    return createResponse("success", "Lesson updated successfully", null, null);
}

function validateFields(data: FormData, fields: string[]) {
    for (let field of fields) {
        const value = data.get(field) as string;
        if (!value) {
            return createResponse("error", `${field} is required`, null, `${field} is required`);
        }
    }
    return null;
}

export async function createLessonsAction(prevDate: any, data: FormData) {

    
    const title = data.get("title") as string;
    const description = data.get("description") as string;
    const sequence = data.get("sequence") as string;
    const status = data.get("status") as string;
    const video_url = data.get("video_url") as string;
    const course_id = data.get("course_id") as string;
    const language = data.get("language") as string;
    const content = data.get("content") as string;

    
    const requiredFields = ["title", "description", "sequence", "status", "video_url", "course_id", "language", "content"];
    const response = validateFields(data, requiredFields);

    if (response) {
        return response;
    }

    const supabase = createClient();
    const lessonData = await supabase
        .from("lessons")
        .insert({
            video_url,
            status: status,
            sequence: sequence,
            course_id: course_id,
            created_at: new Date(),
            updated_at: new Date(),
        }).select("id");

    if (lessonData.error) {
        console.log(lessonData.error);
        return createResponse("error", "Error creating lesson", null, "Error creating lesson");
    }

    const lessonLocalizationData = await supabase
        .from('lesson_localizations')
        .insert({
            title,
            description,
            content,
            language_code: language,
            lesson_id: lessonData.data[0].id,
        })
        

    if (lessonData.error || lessonLocalizationData.error) {
        console.log(lessonData.error);
        console.log(lessonLocalizationData.error)
        return createResponse("error", "Error updating lesson", null, "Error updating lesson");
    }


    console.log(lessonData.data)

    revalidatePath('/dashboard/teacher/courses/[courseId]/lessons', 'layout');
    
    return createResponse("success", "Lesson created successfully", null, null);
}

export async function deleteLessonsAction(data: {
    lesonId: string;
}) {
    const lessonId = data.lesonId;

    if (!lessonId) {
        return createResponse("error", "Lesson id is required", null, "Lesson id is required");
    }

    const supabase = createClient();
    const lessonData = await supabase
        .from("lessons")
        .delete()
        .eq("id", lessonId);

    if (lessonData.error) {
        console.log(lessonData.error);
        return createResponse("error", "Error deleting lesson", null, "Error deleting lesson");
    }

    revalidatePath('/dashboard/teacher/courses/[courseId]', 'layout');
    return createResponse("success", "Lesson deleted successfully", null, null);
}