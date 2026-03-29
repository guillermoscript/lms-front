"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from '@/lib/supabase/tenant'

export async function updateProfile(formData: FormData) {
    const supabase = await createClient();
    const userId = await getCurrentUserId()
    if (!userId) throw new Error("Unauthorized");

    const full_name = formData.get("full_name") as string;
    const username = formData.get("username") as string;
    const website = formData.get("website") as string;
    const bio = formData.get("bio") as string;

    const { error } = await supabase
        .from("profiles")
        .update({
            full_name,
            username,
            website,
            bio,
        })
        .eq("id", userId);

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/student/profile");
    return { success: true };
}
