"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from '@/lib/supabase/tenant'

/** `profiles.username` carries CHECK `username_length` (>= 3 chars) and a UNIQUE
 *  constraint. Both used to reach the user as a raw Postgres message thrown out
 *  of the action — which Next reports as an unhandled Server Action error
 *  (LMS-FRONT-9E) instead of a form validation message. Validate here and return
 *  the failure so the form can show it. */
const USERNAME_MIN_LENGTH = 3

export type UpdateProfileResult =
    | { success: true }
    | { success: false; field?: 'username'; code: 'unauthorized' | 'username_too_short' | 'username_taken' | 'unknown' }

/** Trim, and treat a cleared field as NULL rather than `''` — an empty string
 *  fails `username_length`, while NULL is allowed by both constraints. */
function optional(value: FormDataEntryValue | null): string | null {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed.length > 0 ? trimmed : null
}

export async function updateProfile(formData: FormData): Promise<UpdateProfileResult> {
    const supabase = await createClient();
    const userId = await getCurrentUserId()
    if (!userId) return { success: false, code: 'unauthorized' }

    const full_name = optional(formData.get("full_name"));
    const username = optional(formData.get("username"));
    const website = optional(formData.get("website"));
    const bio = optional(formData.get("bio"));

    if (username !== null && username.length < USERNAME_MIN_LENGTH) {
        return { success: false, field: 'username', code: 'username_too_short' }
    }

    const { error } = await supabase
        .from("profiles")
        .update({
            full_name,
            username,
            website,
            bio,
        })
        .eq("id", userId);

    if (error) {
        // 23505 = unique_violation on profiles_username_key; 23514 = the
        // username_length CHECK, still possible if the constraint tightens.
        if (error.code === '23505') return { success: false, field: 'username', code: 'username_taken' }
        if (error.code === '23514') return { success: false, field: 'username', code: 'username_too_short' }
        return { success: false, code: 'unknown' }
    }

    revalidatePath("/dashboard/student/profile");
    revalidatePath("/dashboard/settings");
    return { success: true };
}
