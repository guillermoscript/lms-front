'use server';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Mock enrollment for testing checkout flow
 * In production, this should be called by Stripe webhook after successful payment
 * 
 * This action:
 * 1. Creates a transaction record
 * 2. Calls enroll_user RPC (for products) or handle_new_subscription (for plans)
 * 3. Enrolls user in associated courses
 */
export async function enrollUser(courseId?: string, planId?: string) {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("You must be logged in to enroll.");
    }

    try {
        if (courseId) {
            // Get product for this course
            const { data: productCourse } = await supabase
                .from('product_courses')
                .select('product_id, product:products(*)')
                .eq('course_id', parseInt(courseId))
                .single();

            if (!productCourse) {
                throw new Error("No product found for this course.");
            }

            const product = productCourse.product as any;

            // Create transaction record (mock payment)
            const { data: transaction, error: txError } = await supabase
                .from('transactions')
                .insert({
                    user_id: user.id,
                    product_id: product.product_id,
                    amount: product.price,
                    currency: product.currency,
                    payment_method: 'mock_test',
                    status: 'successful' // Note: must be 'successful' not 'succeeded'
                })
                .select()
                .single();

            if (txError) {
                console.error("Transaction error:", txError);
                throw new Error("Failed to create transaction: " + txError.message);
            }

            // Call enroll_user RPC function
            // This function checks for transaction and enrolls in linked courses
            const { error: enrollError } = await supabase.rpc('enroll_user', {
                _user_id: user.id,
                _product_id: product.product_id
            });

            if (enrollError) {
                console.error("Enrollment error:", enrollError);
                throw new Error("Failed to enroll: " + enrollError.message);
            }

            revalidatePath('/dashboard/student');
            return { success: true, transaction_id: transaction.transaction_id };

        } else if (planId) {
            // Get plan details
            const { data: plan, error: planError } = await supabase
                .from('plans')
                .select('*')
                .eq('plan_id', parseInt(planId))
                .single();

            if (planError || !plan) {
                throw new Error("Plan not found.");
            }

            // Create transaction for plan
            const { data: transaction, error: txError } = await supabase
                .from('transactions')
                .insert({
                    user_id: user.id,
                    plan_id: plan.plan_id,
                    amount: plan.price,
                    currency: plan.currency,
                    payment_method: 'mock_test',
                    status: 'successful'
                })
                .select()
                .single();

            if (txError) {
                console.error("Transaction error:", txError);
                throw new Error("Failed to create transaction: " + txError.message);
            }

            // Call handle_new_subscription RPC function
            const { error: subError } = await supabase.rpc('handle_new_subscription', {
                _user_id: user.id,
                _plan_id: plan.plan_id,
                _transaction_id: transaction.transaction_id
            });

            if (subError) {
                console.error("Subscription error:", subError);
                throw new Error("Failed to create subscription: " + subError.message);
            }

            revalidatePath('/dashboard/student');
            return { success: true, transaction_id: transaction.transaction_id };
        }

        throw new Error("Must provide either courseId or planId");

    } catch (error) {
        console.error("Enrollment failed:", error);
        throw error;
    }
}
