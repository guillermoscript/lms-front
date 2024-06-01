"use server";
import { createResponse } from "@/utils/functions";
import { createClient } from "@/utils/supabase/server";
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
        .from('exams')
        .delete()
        .eq('exam_id', testId)

    if (lessonData.error) {
        console.log(lessonData.error);
        return createResponse("error", "Error deleting lesson", null, "Error deleting lesson");
    }

    revalidatePath('/dashboard/teacher/courses/[courseId]', 'layout');
    return createResponse("success", "Lesson deleted successfully", null, null);
}

