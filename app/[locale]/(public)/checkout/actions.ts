'use server';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId } from '@/lib/supabase/tenant'

/**
 * Mock enrollment for testing checkout flow
 * In production, this should be called by Stripe webhook after successful payment
 * 
 * This action:
 * 1. Creates a transaction record
 * 2. Calls enroll_user RPC (for products) or handle_new_subscription (for plans)
 * 3. Enrolls user in associated courses
 */
export async function enrollUser(courseId?: string, planId?: string, paymentMethod: string = 'mock_test') {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const userId = await getCurrentUserId()
    if (!userId) {
        throw new Error("You must be logged in to enroll.");
    }

    try {
        if (courseId) {
            // Get product for this course (pick first match)
            const { data: productCourses } = await supabase
                .from('product_courses')
                .select('product_id, product:products(*)')
                .eq('course_id', parseInt(courseId))
                .limit(1);

            if (!productCourses || productCourses.length === 0) {
                throw new Error("No product found for this course.");
            }

            const product = productCourses[0].product as any;

            // Create transaction record (mock payment)
            const { data: transaction, error: txError } = await supabase
                .from('transactions')
                .insert({
                    user_id: userId,
                    product_id: product.product_id,
                    amount: product.price,
                    currency: product.currency,
                    payment_method: paymentMethod,
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
                _user_id: userId,
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
                    user_id: userId,
                    plan_id: plan.plan_id,
                    amount: plan.price,
                    currency: plan.currency,
                    payment_method: paymentMethod,
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
                _user_id: userId,
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

/**
 * Enroll user in a free course or plan
 */
export async function enrollFree(courseId?: string, planId?: string) {
    const supabase = await createServerClient();
    const userId = await getCurrentUserId()
    if (!userId) {
        throw new Error("You must be logged in to enroll.");
    }

    try {
        if (courseId) {
            // Check if the course is actually free
            const { data: productCourses } = await supabase
                .from('product_courses')
                .select('product:products(product_id, price)')
                .eq('course_id', parseInt(courseId))
                .limit(1);

            const courseProduct = productCourses?.[0]?.product as any;
            const isFree = courseProduct ? parseFloat(courseProduct.price) === 0 : true;

            if (!isFree) {
                throw new Error("This course is not free. Please use the paid enrollment flow.");
            }

            // For free courses, we need a product_id to satisfy the constraint
            let productId: number;

            if (courseProduct?.product_id) {
                productId = courseProduct.product_id;
            } else {
                // Create a free product if one doesn't exist
                const { data: freeProduct, error: createError } = await supabase
                    .from('products')
                    .insert({
                        name: `Free Access - ${courseId}`,
                        price: 0,
                        currency: 'usd',
                        status: 'active',
                        payment_provider: 'stripe'
                    })
                    .select('product_id')
                    .single();

                if (createError) throw createError;

                // Link product to course
                await supabase
                    .from('product_courses')
                    .insert({
                        product_id: freeProduct.product_id,
                        course_id: parseInt(courseId)
                    });

                productId = freeProduct.product_id;
            }

            // Create enrollment with product_id
            const { error } = await supabase
                .from('enrollments')
                .insert({
                    user_id: userId,
                    course_id: parseInt(courseId),
                    product_id: productId,
                    status: 'active',
                    enrollment_date: new Date().toISOString()
                });

            if (error) {
                // If already enrolled, that's fine
                if (error.code === '23505') return { success: true, alreadyEnrolled: true };
                throw error;
            }

            revalidatePath('/dashboard/student');
            return { success: true };
        }
        
        throw new Error("Free enrollment only supported for courses currently.");
    } catch (error) {
        console.error("Free enrollment failed:", error);
        throw error;
    }
}
