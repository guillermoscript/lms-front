"use server";

import { createResponse } from "@/utils/functions";
import { createClient } from "@/utils/supabase/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const signIn = async (prevData: any, formData: FormData) => {


    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.log(error);
        return createResponse('error', 'Invalid credentials', null, 'Invalid credentials');
    }

    const userData = await supabase.from("user_roles").select("*").eq("user_id", data?.user?.id).single();

    if (userData?.error) {
        console
        return createResponse('error', 'Error in sign in', null, userData.error.message);
    }

    const userRole = userData?.data.role_id;

    if (userRole === 1) {
        return redirect("/dashboard");
    } else if (userRole === 2) {
        return redirect("/dashboard/teacher");
    }

    return redirect("/");

};


export const signUp = async (prevData: any, formData: FormData) => {

    const origin = headers().get("origin");
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback`,
        },
    });

    if (error) {
        console.log(error);
        return createResponse('error', 'Error submitting comment', null, error);
    }

    return redirect("/auth/login?message=Check email to continue sign in process");
};