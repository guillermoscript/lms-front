"use server";

import { createResponse } from "@/utils/functions";
import { createClient } from "@/utils/supabase/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const signIn = async (prevData: any, formData: FormData) => {


    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.log(error);
        return createResponse('error', 'Error submitting comment', null, error);
    }

    redirect("/");
    // return createResponse('success', 'Comment submitted successfully', null, null);
};


export const signUp = async (prevData: any, formData: FormData) => {

    const origin = headers().get("origin");
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

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