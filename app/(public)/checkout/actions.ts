'use server';

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function enrollUser(courseId?: string, planId?: string) {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("You must be logged in to enroll.");
    }

    // 2. Initialize Admin Client to bypass RLS
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (courseId) {
        // Enroll in specific course
        const { error } = await adminClient
            .from('enrollments')
            .insert({
                user_id: user.id,
                course_id: parseInt(courseId),
                status: 'active'
            });

        if (error) {
            console.error("Enrollment error:", error);
            throw new Error("Failed to enroll: " + error.message);
        }
    } else if (planId) {
        // Mock Plan Subscription
        // 1. Create subscription
        // 2. Mock enroll in some courses or all courses?
        // For now, let's just enroll in ALL published courses for the Mock Plan

        const { data: courses } = await adminClient
            .from('courses')
            .select('id')
            .eq('status', 'published');

        if (courses) {
            const enrollments = courses.map(c => ({
                user_id: user.id,
                course_id: c.id,
                status: 'active'
            }));

            const { error } = await adminClient.from('enrollments').insert(enrollments);
            if (error) {
                console.error("Plan enrollment error:", error);
                throw new Error("Failed to subscribe: " + error.message);
            }
        }
    }

    return { success: true };
}
